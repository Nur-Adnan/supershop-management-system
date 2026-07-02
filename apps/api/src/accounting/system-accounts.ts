export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export interface SystemAccountDef {
  code: string;
  name: string;
  type: AccountType;
}

/**
 * Seeded on API boot (idempotent, mirrors RolesService.ensureSystemRoles) and referenced by code
 * from checkout/GRN/expense posting. `isSystem` accounts can't be edited/deleted via the API.
 *
 * Simplification: every non-CREDIT payment/refund method (CASH, CARD, BKASH, NAGAD, ROCKET) posts
 * to the single CASH account rather than a per-method clearing account. A real deployment wanting
 * per-channel reconciliation would add one clearing account per method — deferred as out of scope
 * for this phase.
 */
export const SYSTEM_ACCOUNTS = {
  CASH: "1000",
  ACCOUNTS_RECEIVABLE: "1010",
  INVENTORY: "1020",
  ACCOUNTS_PAYABLE: "2000",
  TAX_PAYABLE: "2010",
  OWNERS_EQUITY: "3000",
  SALES_REVENUE: "4000",
  COST_OF_GOODS_SOLD: "5000",
  GENERAL_EXPENSES: "5010",
} as const;

export const SYSTEM_ACCOUNT_DEFS: SystemAccountDef[] = [
  { code: SYSTEM_ACCOUNTS.CASH, name: "Cash", type: "ASSET" },
  { code: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, name: "Accounts Receivable", type: "ASSET" },
  { code: SYSTEM_ACCOUNTS.INVENTORY, name: "Inventory", type: "ASSET" },
  { code: SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, name: "Accounts Payable", type: "LIABILITY" },
  { code: SYSTEM_ACCOUNTS.TAX_PAYABLE, name: "Tax Payable", type: "LIABILITY" },
  { code: SYSTEM_ACCOUNTS.OWNERS_EQUITY, name: "Owner's Equity", type: "EQUITY" },
  { code: SYSTEM_ACCOUNTS.SALES_REVENUE, name: "Sales Revenue", type: "INCOME" },
  { code: SYSTEM_ACCOUNTS.COST_OF_GOODS_SOLD, name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: SYSTEM_ACCOUNTS.GENERAL_EXPENSES, name: "General Expenses", type: "EXPENSE" },
];

/** The account a sale payment or sale refund settles against. CREDIT goes to Accounts
 * Receivable — the customer owes the shop. Do not reuse this for expenses: see
 * expenseSettlementAccountForMethod, where CREDIT means the opposite (the shop owes a vendor). */
export function cashAccountForMethod(method: string): string {
  return method === "CREDIT" ? SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE : SYSTEM_ACCOUNTS.CASH;
}

/** The account an expense settles against. CREDIT means the expense was bought on credit from a
 * vendor, i.e. a new liability (Accounts Payable) — the mirror image of cashAccountForMethod's
 * CREDIT case, which is a sales-side asset (Accounts Receivable). */
export function expenseSettlementAccountForMethod(method: string): string {
  return method === "CREDIT" ? SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE : SYSTEM_ACCOUNTS.CASH;
}
