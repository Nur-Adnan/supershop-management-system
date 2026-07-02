/**
 * Recursively drops keys that could be interpreted as MongoDB operators ($-prefixed)
 * or dotted paths from request payloads. Defense-in-depth against operator injection,
 * applied before guards/pipes via a Fastify preHandler hook. (Strict Zod DTOs are the
 * primary defense; the query allow-list parser covers query strings.)
 */
export function sanitizeMongo(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMongo);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      out[key] = sanitizeMongo(val);
    }
    return out;
  }
  return value;
}
