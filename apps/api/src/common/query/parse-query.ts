import { DEFAULT_PAGE_LIMIT, ErrorCode, MAX_PAGE_LIMIT } from "@supershop/shared";
import { DomainException } from "../domain.exception";

/** What a list endpoint permits clients to filter and sort by. Anything else is rejected. */
export interface QueryAllowList {
  filter?: string[];
  sort?: string[];
}

export interface ParsedPageQuery {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  filter: Record<string, string | number | boolean>;
}

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

function parseSort(raw: unknown, allowed: string[]): Record<string, 1 | -1> {
  if (typeof raw !== "string" || raw.length === 0) return { _id: -1 };
  const sort: Record<string, 1 | -1> = {};
  for (const token of raw.split(",")) {
    const desc = token.startsWith("-");
    const field = desc ? token.slice(1) : token;
    if (!allowed.includes(field)) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, `Cannot sort by '${field}'`, 400);
    }
    sort[field] = desc ? -1 : 1;
  }
  return sort;
}

/**
 * Only allow-listed fields with SCALAR values become filters. A non-scalar value
 * (e.g. an injected { $ne: ... } object) is rejected — this is the Mongo
 * operator-injection boundary for query strings.
 */
function parseFilter(
  raw: Record<string, unknown>,
  allowed: string[],
): Record<string, string | number | boolean> {
  const filter: Record<string, string | number | boolean> = {};
  for (const field of allowed) {
    const value = raw[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        `Invalid filter value for '${field}'`,
        400,
      );
    }
    filter[field] = value;
  }
  return filter;
}

export function parsePageQuery(
  raw: Record<string, unknown>,
  allow: QueryAllowList = {},
): ParsedPageQuery {
  const limit = clampLimit(raw.limit);
  const pageRaw = Math.floor(Number(raw.page));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: parseSort(raw.sort, allow.sort ?? []),
    filter: parseFilter(raw, allow.filter ?? []),
  };
}
