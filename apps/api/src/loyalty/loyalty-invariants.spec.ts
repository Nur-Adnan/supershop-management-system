import {
  assertSufficientPoints,
  computePointsEarned,
  computeRedemptionValue,
} from "./loyalty-invariants";

describe("computePointsEarned", () => {
  it("awards 1 point per 100 minor units, floored", () => {
    expect(computePointsEarned(350)).toBe(3);
    expect(computePointsEarned(399)).toBe(3);
    expect(computePointsEarned(400)).toBe(4);
  });

  it("returns 0 for zero or negative revenue", () => {
    expect(computePointsEarned(0)).toBe(0);
    expect(computePointsEarned(-100)).toBe(0);
  });
});

describe("computeRedemptionValue", () => {
  it("converts points to minor units 1:1", () => {
    expect(computeRedemptionValue(150)).toBe(150);
  });

  it("returns 0 for 0 points", () => {
    expect(computeRedemptionValue(0)).toBe(0);
  });
});

describe("assertSufficientPoints", () => {
  it("accepts redeeming up to the full balance", () => {
    expect(() => assertSufficientPoints(100, 100)).not.toThrow();
  });

  it("accepts redeeming less than the balance", () => {
    expect(() => assertSufficientPoints(100, 50)).not.toThrow();
  });

  it("rejects redeeming more than the balance", () => {
    expect(() => assertSufficientPoints(100, 101)).toThrow(/Insufficient loyalty points/);
  });
});
