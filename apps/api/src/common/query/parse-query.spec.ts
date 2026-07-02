import { DomainException } from "../domain.exception";
import { parsePageQuery } from "./parse-query";

const ALLOW = { filter: ["status", "email"], sort: ["email", "createdAt"] };

describe("parsePageQuery", () => {
  it("defaults page/limit/sort", () => {
    const q = parsePageQuery({}, ALLOW);
    expect(q.page).toBe(1);
    expect(q.limit).toBe(20);
    expect(q.skip).toBe(0);
    expect(q.sort).toEqual({ _id: -1 });
  });

  it("parses allow-listed multi-field sort with direction", () => {
    expect(parsePageQuery({ sort: "-email,createdAt" }, ALLOW).sort).toEqual({
      email: -1,
      createdAt: 1,
    });
  });

  it("rejects a non-allow-listed sort field", () => {
    expect(() => parsePageQuery({ sort: "passwordHash" }, ALLOW)).toThrow(DomainException);
  });

  it("keeps only allow-listed scalar filters, drops the rest", () => {
    const q = parsePageQuery({ status: "active", email: "a@b.com", roleId: "x" }, ALLOW);
    expect(q.filter).toEqual({ status: "active", email: "a@b.com" });
  });

  it("rejects an operator-injection filter value (non-scalar)", () => {
    expect(() => parsePageQuery({ status: { $ne: "disabled" } }, ALLOW)).toThrow(DomainException);
  });

  it("caps limit at the maximum", () => {
    expect(parsePageQuery({ limit: "9999" }, ALLOW).limit).toBe(100);
  });
});
