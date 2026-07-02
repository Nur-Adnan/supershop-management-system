import { allocateFefo, type FefoBatch } from "./fefo";

const d = (s: string) => new Date(s);

describe("allocateFefo", () => {
  it("consumes the soonest-expiring batch first", () => {
    const batches: FefoBatch[] = [
      { id: "late", qty: 10, expiryDate: d("2027-01-01") },
      { id: "soon", qty: 10, expiryDate: d("2026-01-01") },
    ];
    expect(allocateFefo(batches, 5)).toEqual([{ batchId: "soon", qty: 5 }]);
  });

  it("spans multiple batches in expiry order", () => {
    const batches: FefoBatch[] = [
      { id: "soon", qty: 4, expiryDate: d("2026-01-01") },
      { id: "mid", qty: 4, expiryDate: d("2026-06-01") },
    ];
    expect(allocateFefo(batches, 6)).toEqual([
      { batchId: "soon", qty: 4 },
      { batchId: "mid", qty: 2 },
    ]);
  });

  it("consumes dated stock before undated (non-perishable) stock", () => {
    const batches: FefoBatch[] = [
      { id: "nodate", qty: 10, expiryDate: null },
      { id: "dated", qty: 3, expiryDate: d("2026-01-01") },
    ];
    expect(allocateFefo(batches, 5)).toEqual([
      { batchId: "dated", qty: 3 },
      { batchId: "nodate", qty: 2 },
    ]);
  });

  it("skips empty batches", () => {
    const batches: FefoBatch[] = [
      { id: "empty", qty: 0, expiryDate: d("2025-01-01") },
      { id: "full", qty: 5, expiryDate: d("2026-01-01") },
    ];
    expect(allocateFefo(batches, 5)).toEqual([{ batchId: "full", qty: 5 }]);
  });

  it("handles fractional (weighted) quantities", () => {
    const batches: FefoBatch[] = [{ id: "kg", qty: 2.5, expiryDate: d("2026-01-01") }];
    expect(allocateFefo(batches, 1.5)).toEqual([{ batchId: "kg", qty: 1.5 }]);
  });

  it("throws INSUFFICIENT_STOCK when total is short", () => {
    const batches: FefoBatch[] = [{ id: "a", qty: 3, expiryDate: d("2026-01-01") }];
    expect(() => allocateFefo(batches, 5)).toThrow(/Insufficient stock/);
  });

  it("rejects a non-positive request", () => {
    expect(() => allocateFefo([], 0)).toThrow(/must be positive/);
  });
});
