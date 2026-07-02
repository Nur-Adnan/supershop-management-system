export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface PaginationMeta {
  /** 1-based page number (page-based mode). */
  page?: number;
  limit: number;
  /** Total matching documents (page-based mode; omitted for cursor mode). */
  total?: number;
  totalPages?: number;
  /** Opaque cursor for the next page (cursor mode). `null` when exhausted. */
  nextCursor?: string | null;
  hasMore?: boolean;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PageQuery {
  page?: number;
  limit?: number;
  /** Allow-listed sort, e.g. "-createdAt" (desc) or "name" (asc). */
  sort?: string;
}

export interface CursorQuery {
  cursor?: string | null;
  limit?: number;
  sort?: string;
}
