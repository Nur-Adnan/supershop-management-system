import { SUPPORTED_CURRENCIES } from "@supershop/shared";
import { z } from "zod";

/**
 * Money as stored: integer minor units + currency (Hard Rule 7 — never floats).
 * `.int()` rejects fractional input at the boundary.
 */
export const moneySchema = z
  .object({
    amount: z.number().int(),
    currency: z.enum(SUPPORTED_CURRENCIES),
  })
  .strict();

/** A non-negative money value — for balances, credit limits, prices. */
export const nonNegativeMoneySchema = moneySchema.extend({
  amount: z.number().int().nonnegative(),
});

/** A strictly positive money value — for payments, cash movements, opening floats. */
export const positiveMoneySchema = moneySchema.extend({
  amount: z.number().int().positive(),
});
