import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import { CategoriesRepository } from "../catalog/category.repository";
import { ProductsRepository } from "../catalog/product.repository";
import { DomainException } from "../common/domain.exception";
import { BaseCrudService, type WritePayload } from "../common/service/base-crud.service";
import { CustomerGroupsRepository } from "../customers/customer-group.repository";
import { assertValidPromotionShape } from "./promotion-invariants";
import { Promotion } from "./promotion.schema";
import { PromotionRepository } from "./promotion.repository";

@Injectable()
export class PromotionsService extends BaseCrudService<Promotion> {
  protected readonly entityName = "Promotion";

  constructor(
    private readonly promotions: PromotionRepository,
    private readonly products: ProductsRepository,
    private readonly categories: CategoriesRepository,
    private readonly customerGroups: CustomerGroupsRepository,
  ) {
    super(promotions);
  }

  protected override conflictMessage(): string {
    return "A promotion with this code already exists";
  }

  protected override async validateCreate(input: WritePayload): Promise<void> {
    assertValidPromotionShape({
      type: input.type as Promotion["type"],
      valueBps: input.valueBps as number | undefined,
      valueAmount: input.valueAmount as { amount: number } | undefined,
      validFrom: new Date(input.validFrom as string | Date),
      validTo: new Date(input.validTo as string | Date),
      usageLimit: input.usageLimit as number | undefined,
    });
    await this.assertRefsExist(input);
  }

  protected override async validateUpdate(id: string, input: WritePayload): Promise<void> {
    const existing = await this.getOrThrow(id);
    assertValidPromotionShape({
      type: existing.type,
      valueBps: (input.valueBps as number | undefined) ?? existing.valueBps,
      valueAmount: (input.valueAmount as { amount: number } | undefined) ?? existing.valueAmount,
      validFrom: input.validFrom ? new Date(input.validFrom as string | Date) : existing.validFrom,
      validTo: input.validTo ? new Date(input.validTo as string | Date) : existing.validTo,
      usageLimit: (input.usageLimit as number | undefined) ?? existing.usageLimit,
    });
    await this.assertRefsExist(input);
  }

  private async assertRefsExist(input: WritePayload): Promise<void> {
    const productIds = (input.productIds as string[] | undefined) ?? [];
    const categoryIds = (input.categoryIds as string[] | undefined) ?? [];
    const customerGroupIds = (input.customerGroupIds as string[] | undefined) ?? [];

    for (const id of productIds) {
      if (!(await this.products.findById(id))) {
        throw new DomainException(ErrorCode.VALIDATION_ERROR, `Product ${id} does not exist`, 400);
      }
    }
    for (const id of categoryIds) {
      if (!(await this.categories.findById(id))) {
        throw new DomainException(ErrorCode.VALIDATION_ERROR, `Category ${id} does not exist`, 400);
      }
    }
    for (const id of customerGroupIds) {
      if (!(await this.customerGroups.findById(id))) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Customer group ${id} does not exist`,
          400,
        );
      }
    }
  }
}
