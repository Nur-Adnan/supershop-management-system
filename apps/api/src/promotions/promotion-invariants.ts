import { ErrorCode, PromotionType } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

export interface PromotionShapeInput {
  type: PromotionType;
  valueBps?: number;
  valueAmount?: { amount: number };
  validFrom: Date;
  validTo: Date;
  usageLimit?: number;
}

/** Structural invariants for a promotion's own fields (shape), independent of any cart. */
export function assertValidPromotionShape(input: PromotionShapeInput): void {
  if (input.validFrom.getTime() >= input.validTo.getTime()) {
    throw new DomainException(ErrorCode.VALIDATION_ERROR, "validFrom must be before validTo", 400);
  }
  if (input.usageLimit !== undefined && input.usageLimit < 1) {
    throw new DomainException(ErrorCode.VALIDATION_ERROR, "usageLimit must be at least 1", 400);
  }
  if (input.type === PromotionType.PERCENT) {
    if (input.valueBps === undefined) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "PERCENT promotions require valueBps",
        400,
      );
    }
    if (input.valueAmount !== undefined) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "PERCENT promotions must not set valueAmount",
        400,
      );
    }
  } else {
    if (input.valueAmount === undefined) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "FIXED promotions require valueAmount",
        400,
      );
    }
    if (input.valueBps !== undefined) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "FIXED promotions must not set valueBps",
        400,
      );
    }
  }
}

export interface PromotionWindow {
  isActive: boolean;
  validFrom: Date;
  validTo: Date;
  usageLimit?: number;
  usageCount: number;
  customerGroupIds: string[];
}

/** Whether a promotion may be applied right now, independent of the cart's contents. */
export function assertPromotionApplicable(
  promo: PromotionWindow,
  now: Date,
  customerGroupId: string | undefined,
): void {
  if (!promo.isActive) {
    throw new DomainException(ErrorCode.VALIDATION_ERROR, "Promotion is not active", 400);
  }
  if (now.getTime() < promo.validFrom.getTime() || now.getTime() > promo.validTo.getTime()) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "Promotion is not within its valid date range",
      400,
    );
  }
  if (promo.usageLimit !== undefined && promo.usageCount >= promo.usageLimit) {
    throw new DomainException(ErrorCode.CONFLICT, "Promotion usage limit has been reached", 409);
  }
  if (promo.customerGroupIds.length > 0) {
    if (!customerGroupId || !promo.customerGroupIds.includes(customerGroupId)) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Customer is not eligible for this promotion",
        400,
      );
    }
  }
}

export interface PromotionLineContext {
  productId: string;
  categoryId?: string;
  lineSubtotal: number;
}

/** Sums the lines a promotion's productIds/categoryIds restriction applies to. Empty
 * restrictions (both arrays empty) mean cart-wide — every line is eligible. */
export function computeEligibleSubtotal(
  lines: PromotionLineContext[],
  productIds: string[],
  categoryIds: string[],
): number {
  const restricted = productIds.length > 0 || categoryIds.length > 0;
  if (!restricted) return lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  return lines
    .filter(
      (l) =>
        productIds.includes(l.productId) ||
        (l.categoryId !== undefined && categoryIds.includes(l.categoryId)),
    )
    .reduce((sum, l) => sum + l.lineSubtotal, 0);
}

/** Discount in minor units for the eligible portion of the cart. Assumes the promotion's own
 * shape was already validated (assertValidPromotionShape) — exactly one of valueBps/valueAmount
 * is set, matching `type`. */
export function computePromotionDiscount(
  type: PromotionType,
  eligibleSubtotal: number,
  valueBps: number | undefined,
  valueAmount: number | undefined,
): number {
  if (eligibleSubtotal <= 0) return 0;
  if (type === PromotionType.PERCENT) {
    return Math.round((eligibleSubtotal * (valueBps ?? 0)) / 10_000);
  }
  return Math.min(valueAmount ?? 0, eligibleSubtotal);
}
