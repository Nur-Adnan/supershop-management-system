import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import type { UpdateQuery } from "mongoose";
import type { Principal } from "../auth/principal";
import { ProductsRepository } from "../catalog/product.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { MoneyEmbed } from "../common/schema/money.schema";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { CountersService } from "../counters/counters.service";
import { StoresRepository } from "../stores/store.repository";
import { SuppliersRepository } from "../suppliers/supplier.repository";
import type { PurchaseOrder, PurchaseOrderLine } from "./purchase-order.schema";
import { PurchaseOrderRepository } from "./purchase-order.repository";

export interface CreatePurchaseOrderInput {
  supplierId: string;
  storeId: string;
  lines: Array<{ productId: string; qty: number; unitCost: MoneyEmbed }>;
  notes?: string;
}
export interface UpdatePurchaseOrderInput {
  lines?: Array<{ productId: string; qty: number; unitCost: MoneyEmbed }>;
  notes?: string;
}

function computeTotal(lines: Array<{ qty: number; unitCost: MoneyEmbed }>): MoneyEmbed {
  const currency = lines[0]?.unitCost.currency ?? "BDT";
  const amount = lines.reduce((sum, l) => sum + l.qty * l.unitCost.amount, 0);
  return { amount: Math.round(amount), currency };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly orders: PurchaseOrderRepository,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly counters: CountersService,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.orders.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<PurchaseOrder> {
    const po = await this.orders.findById(id);
    if (!po) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase order not found", 404);
    return po;
  }

  async create(input: CreatePurchaseOrderInput, actor?: Principal): Promise<PurchaseOrder> {
    if (!(await this.suppliers.findById(input.supplierId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Supplier does not exist", 400);
    }
    if (!(await this.stores.findById(input.storeId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
    await this.assertProductsExist(input.lines);

    const lines = input.lines.map((l) => ({ ...l, receivedQty: 0 }));
    return this.orders.create(
      persist<PurchaseOrder>({
        number: await this.counters.nextFormatted("purchase_order", "PO", {
          year: new Date().getFullYear(),
        }),
        supplierId: input.supplierId,
        storeId: input.storeId,
        lines,
        status: "DRAFT",
        total: computeTotal(lines),
        notes: input.notes,
        createdBy: actor?.userId,
        updatedBy: actor?.userId,
      }),
    );
  }

  async update(
    id: string,
    input: UpdatePurchaseOrderInput,
    actor?: Principal,
  ): Promise<PurchaseOrder> {
    const po = await this.getOrThrow(id);
    if (po.status !== "DRAFT") {
      throw new DomainException(
        ErrorCode.CONFLICT,
        "Only a DRAFT purchase order can be edited",
        409,
      );
    }
    if (input.lines) await this.assertProductsExist(input.lines);

    const lines = input.lines ? input.lines.map((l) => ({ ...l, receivedQty: 0 })) : undefined;
    const updated = await this.orders.updateById(
      id,
      persist<UpdateQuery<PurchaseOrder>>({
        $set: {
          ...(lines ? { lines, total: computeTotal(lines) } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updatedBy: actor?.userId,
        },
      }),
    );
    if (!updated) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase order not found", 404);
    return updated;
  }

  async approve(id: string, actor?: Principal): Promise<PurchaseOrder> {
    const po = await this.getOrThrow(id);
    if (po.status !== "DRAFT") {
      throw new DomainException(
        ErrorCode.CONFLICT,
        "Only a DRAFT purchase order can be approved",
        409,
      );
    }
    const updated = await this.orders.updateById(id, {
      $set: { status: "APPROVED", approvedBy: actor?.userId, updatedBy: actor?.userId },
    });
    if (!updated) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase order not found", 404);
    return updated;
  }

  async cancel(id: string, actor?: Principal): Promise<PurchaseOrder> {
    const po = await this.getOrThrow(id);
    if (po.status !== "DRAFT" && po.status !== "APPROVED") {
      throw new DomainException(
        ErrorCode.CONFLICT,
        "Only a DRAFT or APPROVED purchase order can be cancelled",
        409,
      );
    }
    const updated = await this.orders.updateById(id, {
      $set: { status: "CANCELLED", updatedBy: actor?.userId },
    });
    if (!updated) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase order not found", 404);
    return updated;
  }

  private async assertProductsExist(lines: Array<{ productId: string }>): Promise<void> {
    for (const line of lines) {
      if (!(await this.products.findById(line.productId))) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Product ${line.productId} does not exist`,
          400,
        );
      }
    }
  }
}

export type { PurchaseOrderLine };
