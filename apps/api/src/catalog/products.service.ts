import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode } from "@supershop/shared";
import type { Model } from "mongoose";
import type { Principal } from "../auth/principal";
import { DomainException } from "../common/domain.exception";
import { isDuplicateKeyError } from "../common/mongo.util";
import {
  BaseCrudService,
  toWritePayload,
  type WritePayload,
} from "../common/service/base-crud.service";
import { BrandsRepository } from "./brand.repository";
import { CategoriesRepository } from "./category.repository";
import { assertUnitSupportsProduct } from "./product-invariants";
import { productCreateSchema } from "./product.dto";
import { Product } from "./product.schema";
import { ProductsRepository } from "./product.repository";
import { UnitsRepository } from "./unit.repository";

export interface BulkRowResult {
  sku: string;
  status: "created" | "updated" | "error";
  error?: string;
}
export interface BulkImportResult {
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: BulkRowResult[];
}

@Injectable()
export class ProductsService extends BaseCrudService<Product> {
  protected readonly entityName = "Product";

  constructor(
    private readonly products: ProductsRepository,
    @InjectModel(Product.name) private readonly model: Model<Product>,
    private readonly units: UnitsRepository,
    private readonly categories: CategoriesRepository,
    private readonly brands: BrandsRepository,
  ) {
    super(products);
  }

  protected override conflictMessage(): string {
    return "A product with this SKU or barcode already exists";
  }

  protected override async validateCreate(input: WritePayload): Promise<void> {
    await this.assertRefsExist(input.categoryId, input.brandId);
    const unit = await this.units.findById(String(input.unitId));
    assertUnitSupportsProduct(Boolean(input.isWeighted), unit);
  }

  protected override async validateUpdate(id: string, input: WritePayload): Promise<void> {
    await this.assertRefsExist(input.categoryId, input.brandId);
    if (input.unitId === undefined && input.isWeighted === undefined) return;
    const current = await this.products.findById(id);
    const unitId = input.unitId ?? current?.unitId;
    const isWeighted = input.isWeighted ?? current?.isWeighted ?? false;
    const unit = await this.units.findById(String(unitId));
    assertUnitSupportsProduct(Boolean(isWeighted), unit);
  }

  private async assertRefsExist(categoryId: unknown, brandId: unknown): Promise<void> {
    if (categoryId && !(await this.categories.findById(String(categoryId)))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Category does not exist", 400);
    }
    if (brandId && !(await this.brands.findById(String(brandId)))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Brand does not exist", 400);
    }
  }

  /**
   * Bulk upsert products keyed by SKU. Each row is validated independently (invalid rows are
   * reported, not fatal) and treated as the full desired document — an existing SKU is
   * overwritten with the row's fields. No transaction: partial success is the intended import
   * semantic. ponytail: JSON rows, not multipart CSV; the CSV→rows parse is a client/edge concern.
   */
  async bulkImport(rows: unknown[], actor?: Principal): Promise<BulkImportResult> {
    const results: BulkRowResult[] = [];
    for (const raw of rows) {
      const sku = skuOf(raw);
      const parsed = productCreateSchema.safeParse(raw);
      if (!parsed.success) {
        results.push({
          sku,
          status: "error",
          error: parsed.error.issues[0]?.message ?? "invalid row",
        });
        continue;
      }
      try {
        await this.validateCreate(toWritePayload(parsed.data));
        const { sku: rowSku, ...rest } = parsed.data;
        const set: Record<string, unknown> = { ...rest };
        const setOnInsert: Record<string, unknown> = {};
        if (actor?.userId) {
          set.updatedBy = actor.userId;
          setOnInsert.createdBy = actor.userId;
        }
        const update = Object.keys(setOnInsert).length
          ? { $set: set, $setOnInsert: setOnInsert }
          : { $set: set };
        const res = await this.model.updateOne({ sku: rowSku }, update, { upsert: true });
        results.push({ sku: rowSku, status: res.upsertedCount > 0 ? "created" : "updated" });
      } catch (err) {
        results.push({ sku, status: "error", error: importErrorMessage(err) });
      }
    }
    return {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      failed: results.filter((r) => r.status === "error").length,
      results,
    };
  }
}

function skuOf(raw: unknown): string {
  if (raw && typeof raw === "object" && "sku" in raw) {
    const sku = (raw as { sku: unknown }).sku;
    if (typeof sku === "string") return sku;
  }
  return "(unknown)";
}

function importErrorMessage(err: unknown): string {
  if (err instanceof DomainException) return err.message;
  if (isDuplicateKeyError(err)) return "Duplicate SKU or barcode";
  return "Import failed";
}
