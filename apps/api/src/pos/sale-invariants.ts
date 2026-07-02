import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

/** A non-weighted product (sold by piece) can't be sold in a fractional quantity. */
export function assertQtyMatchesUnit(isWeighted: boolean, qty: number): void {
  if (!isWeighted && !Number.isInteger(qty)) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "This product is not sold by weight — quantity must be a whole number",
      400,
    );
  }
}

/**
 * Refund amount for a partial-quantity return, proportional to the original line's total
 * (so tax is refunded proportionally without re-deriving the tax rate). Rounds to the nearest
 * minor unit, same convention as the Money helpers.
 */
export function proportionalRefundAmount(
  originalLineTotal: number,
  originalQty: number,
  returnQty: number,
): number {
  return Math.round((originalLineTotal * returnQty) / originalQty);
}

export type SaleStatus = "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";

/** A sale's status given each line's qty vs. cumulative refundedQty. */
export function computeSaleStatus(lines: Array<{ qty: number; refundedQty: number }>): SaleStatus {
  const allRefunded = lines.every((l) => l.refundedQty >= l.qty);
  if (allRefunded) return "REFUNDED";
  const anyRefunded = lines.some((l) => l.refundedQty > 0);
  return anyRefunded ? "PARTIALLY_REFUNDED" : "COMPLETED";
}
