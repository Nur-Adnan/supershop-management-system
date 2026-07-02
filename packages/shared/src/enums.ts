/** RBAC roles seeded by the platform. Authorization lives in NestJS + Mongo. */
export enum UserRole {
  SUPER_ADMIN = "super_admin",
  STORE_MANAGER = "store_manager",
  CASHIER = "cashier",
  INVENTORY_CLERK = "inventory_clerk",
  ACCOUNTANT = "accountant",
  AUDITOR = "auditor",
}

/** Signed entries in the append-only stock_movements ledger (source of truth). */
export enum StockMovementType {
  RECEIPT = "RECEIPT",
  SALE = "SALE",
  TRANSFER_IN = "TRANSFER_IN",
  TRANSFER_OUT = "TRANSFER_OUT",
  ADJUSTMENT = "ADJUSTMENT",
  RETURN = "RETURN",
}

/** Payment instruments. MFS = mobile financial services (Bangladesh). */
export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  BKASH = "BKASH",
  NAGAD = "NAGAD",
  ROCKET = "ROCKET",
  CREDIT = "CREDIT",
}

export enum PaymentDirection {
  IN = "IN",
  OUT = "OUT",
}

/**
 * Discount mechanics for the promotions engine.
 * ponytail: BOGO/BUNDLE are part of the SCHEMA.md blueprint but need materially different
 * condition modeling and multi-line computation; only PERCENT/FIXED are implemented so far.
 * Add BOGO/BUNDLE here once that computation is built, not before.
 */
export enum PromotionType {
  PERCENT = "PERCENT",
  FIXED = "FIXED",
}

/** Signed entries in the append-only loyalty_transactions ledger. */
export enum LoyaltyTransactionType {
  EARN = "EARN",
  REDEEM = "REDEEM",
}

/** Configurable per org/store. Add currencies here as needed. */
export const SUPPORTED_CURRENCIES = ["BDT", "USD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
