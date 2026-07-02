import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

/** Quantity tolerance so float-valued weighted quantities (e.g. kg) don't misfire. */
const EPSILON = 1e-9;

export interface FefoBatch {
  id: string;
  qty: number;
  expiryDate?: Date | null;
}

export interface FefoAllocation {
  batchId: string;
  qty: number;
}

/** Sort key: soonest expiry first; batches with no expiry (non-perishable) are consumed last. */
function fefoOrder(a: FefoBatch, b: FefoBatch): number {
  const ax = a.expiryDate ? a.expiryDate.getTime() : Number.POSITIVE_INFINITY;
  const bx = b.expiryDate ? b.expiryDate.getTime() : Number.POSITIVE_INFINITY;
  return ax - bx;
}

/**
 * Allocate `requested` units across batches First-Expired-First-Out (Hard Rule 4). Pure:
 * consumes nothing, just returns which batch gives how much. Throws INSUFFICIENT_STOCK if the
 * available quantity can't cover the request. Returns allocations in consumption order.
 */
export function allocateFefo(batches: FefoBatch[], requested: number): FefoAllocation[] {
  if (requested <= 0) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "Requested quantity must be positive",
      400,
    );
  }
  const allocations: FefoAllocation[] = [];
  let remaining = requested;
  for (const batch of [...batches].sort(fefoOrder)) {
    if (remaining <= EPSILON) break;
    if (batch.qty <= EPSILON) continue;
    const take = Math.min(batch.qty, remaining);
    allocations.push({ batchId: batch.id, qty: take });
    remaining -= take;
  }
  if (remaining > EPSILON) {
    throw new DomainException(
      ErrorCode.INSUFFICIENT_STOCK,
      `Insufficient stock: short by ${remaining}`,
      409,
    );
  }
  return allocations;
}
