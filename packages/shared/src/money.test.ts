import test from "node:test";
import assert from "node:assert/strict";
import { money, addMoney, subtractMoney, multiplyMoney, applyRateBps } from "./money.js";

test("add/subtract stay exact in minor units", () => {
  const a = money(15000, "BDT"); // 150.00
  const b = money(2550, "BDT"); //  25.50
  assert.equal(addMoney(a, b).amount, 17550);
  assert.equal(subtractMoney(a, b).amount, 12450);
});

test("multiply by integer qty", () => {
  assert.equal(multiplyMoney(money(1999, "BDT"), 3).amount, 5997);
});

test("VAT 15% via basis points rounds half-up", () => {
  // 15% of 199 paisa = 29.85 -> 30
  assert.equal(applyRateBps(money(199, "BDT"), 1500).amount, 30);
});

test("rejects non-integer amounts (no float money)", () => {
  assert.throws(() => money(10.5, "BDT"));
});

test("rejects cross-currency arithmetic", () => {
  assert.throws(() => addMoney(money(1, "BDT"), money(1, "USD")));
});
