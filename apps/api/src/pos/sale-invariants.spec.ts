import {
  assertQtyMatchesUnit,
  computeSaleStatus,
  proportionalRefundAmount,
} from "./sale-invariants";

describe("assertQtyMatchesUnit", () => {
  it("rejects a fractional quantity for a non-weighted product", () => {
    expect(() => assertQtyMatchesUnit(false, 1.5)).toThrow(/whole number/);
  });
  it("allows a fractional quantity for a weighted product", () => {
    expect(() => assertQtyMatchesUnit(true, 1.5)).not.toThrow();
  });
  it("allows a whole quantity regardless of weighted flag", () => {
    expect(() => assertQtyMatchesUnit(false, 3)).not.toThrow();
    expect(() => assertQtyMatchesUnit(true, 3)).not.toThrow();
  });
});

describe("proportionalRefundAmount", () => {
  it("refunds the full amount when returning the full quantity", () => {
    expect(proportionalRefundAmount(1000, 5, 5)).toBe(1000);
  });
  it("refunds proportionally for a partial return", () => {
    expect(proportionalRefundAmount(1000, 5, 2)).toBe(400);
  });
  it("rounds half-up", () => {
    // 1000 * 1/3 = 333.33 -> 333
    expect(proportionalRefundAmount(1000, 3, 1)).toBe(333);
  });
});

describe("computeSaleStatus", () => {
  it("is COMPLETED when nothing has been refunded", () => {
    expect(computeSaleStatus([{ qty: 2, refundedQty: 0 }])).toBe("COMPLETED");
  });
  it("is PARTIALLY_REFUNDED when some but not all lines are fully refunded", () => {
    expect(
      computeSaleStatus([
        { qty: 2, refundedQty: 2 },
        { qty: 3, refundedQty: 1 },
      ]),
    ).toBe("PARTIALLY_REFUNDED");
  });
  it("is REFUNDED when every line is fully refunded", () => {
    expect(
      computeSaleStatus([
        { qty: 2, refundedQty: 2 },
        { qty: 3, refundedQty: 3 },
      ]),
    ).toBe("REFUNDED");
  });
});
