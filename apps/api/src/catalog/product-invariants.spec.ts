import { assertUnitSupportsProduct } from "./product-invariants";

describe("assertUnitSupportsProduct", () => {
  it("rejects a missing unit", () => {
    expect(() => assertUnitSupportsProduct(false, null)).toThrow(/Unit does not exist/);
  });

  it("rejects a weighted product on a non-decimal unit", () => {
    expect(() => assertUnitSupportsProduct(true, { allowDecimal: false })).toThrow(
      /allows decimals/,
    );
  });

  it("allows a weighted product on a decimal unit", () => {
    expect(() => assertUnitSupportsProduct(true, { allowDecimal: true })).not.toThrow();
  });

  it("allows a non-weighted product on any unit", () => {
    expect(() => assertUnitSupportsProduct(false, { allowDecimal: false })).not.toThrow();
  });
});
