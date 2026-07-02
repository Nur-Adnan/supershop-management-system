import { diffObjects } from "./diff";

describe("diffObjects", () => {
  it("reports changed fields with from/to", () => {
    expect(diffObjects({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual({ b: { from: 2, to: 3 } });
  });

  it("captures added keys", () => {
    expect(diffObjects({ a: 1 }, { a: 1, c: 5 })).toEqual({ c: { from: undefined, to: 5 } });
  });

  it("returns empty when nothing changed", () => {
    expect(diffObjects({ a: 1, nested: { x: 1 } }, { a: 1, nested: { x: 1 } })).toEqual({});
  });
});
