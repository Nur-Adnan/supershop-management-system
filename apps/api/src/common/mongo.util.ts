import { ErrorCode } from "@supershop/shared";
import { DomainException } from "./domain.exception";

/** True for a MongoDB duplicate-key (E11000) error, regardless of how it's wrapped. */
export function isDuplicateKeyError(
  err: unknown,
): err is { code: 11000; keyValue?: Record<string, unknown> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Re-throw a caught error: as a 409 CONFLICT DomainException if it's a duplicate-key
 * violation (unique index), otherwise unchanged. Lets a service write
 * `catch (err) { throwConflictOnDuplicate(err, "SKU already exists"); }`.
 */
export function throwConflictOnDuplicate(err: unknown, message: string): never {
  if (isDuplicateKeyError(err)) throw new DomainException(ErrorCode.CONFLICT, message, 409);
  throw err;
}

/** Mongoose errors caused by bad client input (e.g. a malformed ObjectId) → map to 400. */
export function isMongooseUserError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "CastError" || name === "ValidationError";
}

/**
 * Persistence-boundary cast. A document built for `Model.create`/`updateById` typically has
 * string ids (validated by a Zod DTO) where the schema class types an `ObjectId`, and audit
 * fields (createdBy/updatedBy) that applyBaseSchema adds to the schema at runtime but that don't
 * exist on the TS document class. Mongoose casts strings to ObjectId on write, so this is a type
 * assertion at a boundary the schema is responsible for, not an escape from real type-checking.
 */
export const persist = <T>(doc: Record<string, unknown>): T => doc as T;
