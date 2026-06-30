import type { Currency } from "./enums";

/**
 * Money is stored as an integer in the currency's minor unit (paisa for BDT,
 * cents for USD) — never a float. All arithmetic stays in minor units; only
 * formatMoney() crosses to a decimal string, at the presentation edge.
 */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

function assertInteger(n: number, label: string): void {
  if (!Number.isInteger(n)) {
    throw new Error(`${label} must be an integer minor-unit value, got ${n}`);
  }
}

export function money(amount: number, currency: Currency): Money {
  assertInteger(amount, "amount");
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

/** Multiply by an integer quantity (e.g. a line-item count). */
export function multiplyMoney(m: Money, qty: number): Money {
  assertInteger(qty, "qty");
  return { amount: m.amount * qty, currency: m.currency };
}

/**
 * Apply a rate in basis points (1% = 100 bps) and round half-up to the nearest
 * minor unit. Used for VAT and percentage discounts.
 */
export function applyRateBps(m: Money, bps: number): Money {
  assertInteger(bps, "bps");
  const raw = (m.amount * bps) / 10_000;
  return { amount: Math.round(raw), currency: m.currency };
}

/**
 * Display only. Assumes a 2-decimal minor unit (true for BDT/USD).
 * ponytail: hardcoded /100; add a per-currency exponent table if a 0- or
 * 3-decimal currency (JPY, KWD) is ever supported.
 */
export function formatMoney(m: Money, locale = "en-BD"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
  }).format(m.amount / 100);
}
