import { PromotionType } from "@supershop/shared";
import {
  assertPromotionApplicable,
  assertValidPromotionShape,
  computeEligibleSubtotal,
  computePromotionDiscount,
  type PromotionWindow,
} from "./promotion-invariants";

const window = (overrides: Partial<PromotionWindow> = {}): PromotionWindow => ({
  isActive: true,
  validFrom: new Date("2026-01-01T00:00:00Z"),
  validTo: new Date("2026-12-31T00:00:00Z"),
  usageCount: 0,
  customerGroupIds: [],
  ...overrides,
});

const NOW = new Date("2026-06-01T00:00:00Z");

describe("assertValidPromotionShape", () => {
  it("accepts a valid PERCENT shape", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.PERCENT,
        valueBps: 1000,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).not.toThrow();
  });

  it("accepts a valid FIXED shape", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.FIXED,
        valueAmount: { amount: 500 },
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).not.toThrow();
  });

  it("rejects validFrom on or after validTo", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.PERCENT,
        valueBps: 1000,
        validFrom: new Date("2026-02-01"),
        validTo: new Date("2026-01-01"),
      }),
    ).toThrow(/validFrom must be before validTo/);
  });

  it("rejects usageLimit below 1", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.PERCENT,
        valueBps: 1000,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
        usageLimit: 0,
      }),
    ).toThrow(/usageLimit/);
  });

  it("rejects PERCENT without valueBps", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.PERCENT,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).toThrow(/require valueBps/);
  });

  it("rejects PERCENT with valueAmount also set", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.PERCENT,
        valueBps: 1000,
        valueAmount: { amount: 100 },
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).toThrow(/must not set valueAmount/);
  });

  it("rejects FIXED without valueAmount", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.FIXED,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).toThrow(/require valueAmount/);
  });

  it("rejects FIXED with valueBps also set", () => {
    expect(() =>
      assertValidPromotionShape({
        type: PromotionType.FIXED,
        valueAmount: { amount: 100 },
        valueBps: 500,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-02-01"),
      }),
    ).toThrow(/must not set valueBps/);
  });
});

describe("assertPromotionApplicable", () => {
  it("accepts an active, in-window, unrestricted promotion", () => {
    expect(() => assertPromotionApplicable(window(), NOW, undefined)).not.toThrow();
  });

  it("rejects an inactive promotion", () => {
    expect(() => assertPromotionApplicable(window({ isActive: false }), NOW, undefined)).toThrow(
      /not active/,
    );
  });

  it("rejects before validFrom", () => {
    expect(() => assertPromotionApplicable(window(), new Date("2025-01-01"), undefined)).toThrow(
      /valid date range/,
    );
  });

  it("rejects after validTo", () => {
    expect(() => assertPromotionApplicable(window(), new Date("2027-01-01"), undefined)).toThrow(
      /valid date range/,
    );
  });

  it("rejects once the usage limit is reached", () => {
    expect(() =>
      assertPromotionApplicable(window({ usageLimit: 5, usageCount: 5 }), NOW, undefined),
    ).toThrow(/usage limit/);
  });

  it("accepts below the usage limit", () => {
    expect(() =>
      assertPromotionApplicable(window({ usageLimit: 5, usageCount: 4 }), NOW, undefined),
    ).not.toThrow();
  });

  it("rejects a customer outside the eligible groups", () => {
    expect(() =>
      assertPromotionApplicable(window({ customerGroupIds: ["g1"] }), NOW, "g2"),
    ).toThrow(/not eligible/);
  });

  it("rejects no customer group when groups are restricted", () => {
    expect(() =>
      assertPromotionApplicable(window({ customerGroupIds: ["g1"] }), NOW, undefined),
    ).toThrow(/not eligible/);
  });

  it("accepts a customer in an eligible group", () => {
    expect(() =>
      assertPromotionApplicable(window({ customerGroupIds: ["g1", "g2"] }), NOW, "g2"),
    ).not.toThrow();
  });
});

describe("computeEligibleSubtotal", () => {
  const lines = [
    { productId: "p1", categoryId: "c1", lineSubtotal: 1000 },
    { productId: "p2", categoryId: "c2", lineSubtotal: 2000 },
    { productId: "p3", categoryId: "c1", lineSubtotal: 500 },
  ];

  it("sums every line when unrestricted", () => {
    expect(computeEligibleSubtotal(lines, [], [])).toBe(3500);
  });

  it("sums only matching productIds", () => {
    expect(computeEligibleSubtotal(lines, ["p2"], [])).toBe(2000);
  });

  it("sums only matching categoryIds", () => {
    expect(computeEligibleSubtotal(lines, [], ["c1"])).toBe(1500);
  });

  it("unions productIds and categoryIds matches without double-counting", () => {
    expect(computeEligibleSubtotal(lines, ["p2"], ["c1"])).toBe(3500);
  });

  it("returns 0 when nothing matches", () => {
    expect(computeEligibleSubtotal(lines, ["p9"], ["c9"])).toBe(0);
  });
});

describe("computePromotionDiscount", () => {
  it("computes a PERCENT discount, rounded half-up", () => {
    expect(computePromotionDiscount(PromotionType.PERCENT, 999, 1000, undefined)).toBe(100); // 9.99 -> 10% = 99.9 -> 100
  });

  it("computes a FIXED discount", () => {
    expect(computePromotionDiscount(PromotionType.FIXED, 1000, undefined, 300)).toBe(300);
  });

  it("caps a FIXED discount at the eligible subtotal", () => {
    expect(computePromotionDiscount(PromotionType.FIXED, 100, undefined, 300)).toBe(100);
  });

  it("returns 0 when the eligible subtotal is 0", () => {
    expect(computePromotionDiscount(PromotionType.PERCENT, 0, 1000, undefined)).toBe(0);
    expect(computePromotionDiscount(PromotionType.FIXED, 0, undefined, 300)).toBe(0);
  });
});
