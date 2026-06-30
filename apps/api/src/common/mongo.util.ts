/** True for a MongoDB duplicate-key (E11000) error, regardless of how it's wrapped. */
export function isDuplicateKeyError(
  err: unknown,
): err is { code: 11000; keyValue?: Record<string, unknown> } {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
