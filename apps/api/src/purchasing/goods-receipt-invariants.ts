import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import type { MoneyEmbed } from "../common/schema/money.schema";

/**
 * A GRN line may override the PO's approved unit cost (the actual supplier invoice can differ
 * slightly from the PO's estimate), but only within a bounded tolerance. Without a bound, a
 * caller holding only purchasing.manage (not accounting.post) could inflate or deflate the
 * Inventory/Accounts Payable journal entry this receipt posts by an arbitrary amount — a wider
 * correction belongs in a manual journal entry, which does require accounting.post.
 */
export const MAX_UNIT_COST_VARIANCE_BPS = 1000; // 10%

export function assertUnitCostWithinTolerance(
  provided: MoneyEmbed,
  approved: MoneyEmbed,
  productId: string,
): void {
  if (provided.currency !== approved.currency) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      `Unit cost currency for product ${productId} must match the purchase order's approved currency`,
      400,
    );
  }
  const diff = Math.abs(provided.amount - approved.amount);
  const bound = Math.ceil((approved.amount * MAX_UNIT_COST_VARIANCE_BPS) / 10000);
  if (diff > bound) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      `Unit cost for product ${productId} deviates more than 10% from the purchase order's approved cost ` +
        `(${approved.amount}); post a manual journal adjustment for larger corrections`,
      400,
    );
  }
}
