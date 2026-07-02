import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

/**
 * ponytail: fixed system-wide rates. SCHEMA.md's `settings` collection (per-org/store
 * configurable currency/VAT/feature flags) doesn't exist yet — once it does, these become
 * per-store settings instead of constants.
 */
export const LOYALTY_EARN_MINOR_UNITS_PER_POINT = 100; // 1 point per 100 minor units of net revenue
export const LOYALTY_REDEEM_MINOR_UNITS_PER_POINT = 1; // 1 point = 1 minor unit off the total

export function computePointsEarned(netRevenue: number): number {
  if (netRevenue <= 0) return 0;
  return Math.floor(netRevenue / LOYALTY_EARN_MINOR_UNITS_PER_POINT);
}

export function computeRedemptionValue(points: number): number {
  return points * LOYALTY_REDEEM_MINOR_UNITS_PER_POINT;
}

export function assertSufficientPoints(balance: number, redeemPoints: number): void {
  if (redeemPoints > balance) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      `Insufficient loyalty points: requested ${redeemPoints}, balance is ${balance}`,
      400,
    );
  }
}
