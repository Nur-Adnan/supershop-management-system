export interface FieldChange {
  from: unknown;
  to: unknown;
}

/** Shallow field-level diff. Values compared by JSON identity (ObjectId/Date serialize stably). */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, FieldChange> {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Record<string, FieldChange> = {};
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[key] = { from: a, to: b };
    }
  }
  return changes;
}
