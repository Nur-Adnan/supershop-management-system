import { assertBalancedEntry, reverseLines } from "./journal-invariants";

const line = (accountId: string, debit: number, credit: number) => ({ accountId, debit, credit });

describe("assertBalancedEntry", () => {
  it("accepts a simple balanced two-line entry", () => {
    expect(() =>
      assertBalancedEntry([line("cash", 1000, 0), line("revenue", 0, 1000)]),
    ).not.toThrow();
  });

  it("accepts a balanced multi-line entry", () => {
    expect(() =>
      assertBalancedEntry([
        line("cash", 1100, 0),
        line("revenue", 0, 1000),
        line("taxPayable", 0, 100),
      ]),
    ).not.toThrow();
  });

  it("rejects an unbalanced entry", () => {
    expect(() => assertBalancedEntry([line("cash", 1000, 0), line("revenue", 0, 900)])).toThrow(
      /does not balance/,
    );
  });

  it("rejects a line with both debit and credit set", () => {
    expect(() => assertBalancedEntry([line("a", 100, 50), line("b", 0, 50)])).toThrow(
      /exactly one/,
    );
  });

  it("rejects a line with neither debit nor credit set", () => {
    expect(() => assertBalancedEntry([line("a", 0, 0), line("b", 100, 100)])).toThrow(
      /exactly one/,
    );
  });

  it("rejects a negative amount", () => {
    expect(() => assertBalancedEntry([line("a", -100, 0), line("b", 0, -100)])).toThrow(/negative/);
  });

  it("rejects a non-integer amount", () => {
    expect(() => assertBalancedEntry([line("a", 100.5, 0), line("b", 0, 100.5)])).toThrow(
      /integer/,
    );
  });

  it("rejects a single-line entry", () => {
    expect(() => assertBalancedEntry([line("a", 100, 0)])).toThrow(/at least two lines/);
  });
});

describe("reverseLines", () => {
  it("swaps debit and credit on every line", () => {
    expect(reverseLines([line("cash", 1000, 0), line("revenue", 0, 1000)])).toEqual([
      line("cash", 0, 1000),
      line("revenue", 1000, 0),
    ]);
  });
});
