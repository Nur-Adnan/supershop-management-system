import type { Paginated, PaginationMeta } from "@supershop/shared";

/**
 * Marker class for paginated results. The response-envelope interceptor detects it
 * and emits { success, data: items, meta } instead of wrapping the whole object.
 */
export class Page<T> implements Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}
}
