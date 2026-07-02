import type { Currency } from "@supershop/shared";
import { assertUnitCostWithinTolerance } from "./goods-receipt-invariants";

const money = (amount: number, currency: Currency = "BDT") => ({ amount, currency });

describe("assertUnitCostWithinTolerance", () => {
  it("accepts an exact match", () => {
    expect(() => assertUnitCostWithinTolerance(money(300), money(300), "p1")).not.toThrow();
  });

  it("accepts a small variance within 10%", () => {
    expect(() => assertUnitCostWithinTolerance(money(310), money(300), "p1")).not.toThrow();
  });

  it("accepts a variance exactly at the 10% boundary", () => {
    expect(() => assertUnitCostWithinTolerance(money(330), money(300), "p1")).not.toThrow();
  });

  it("rejects a variance beyond 10%", () => {
    expect(() => assertUnitCostWithinTolerance(money(1000), money(300), "p1")).toThrow(
      /deviates more than 10%/,
    );
  });

  it("rejects a deflated cost beyond 10%", () => {
    expect(() => assertUnitCostWithinTolerance(money(50), money(300), "p1")).toThrow(
      /deviates more than 10%/,
    );
  });

  it("rejects a currency mismatch regardless of amount", () => {
    expect(() => assertUnitCostWithinTolerance(money(300, "USD"), money(300, "BDT"), "p1")).toThrow(
      /currency/,
    );
  });

  it("rejects any nonzero deviation when the approved cost is zero", () => {
    expect(() => assertUnitCostWithinTolerance(money(1), money(0), "p1")).toThrow(
      /deviates more than 10%/,
    );
  });
});
