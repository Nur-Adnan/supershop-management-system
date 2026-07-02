import { z } from "zod";

/**
 * Validated environment. ConfigModule runs `validateEnv` at boot and the app
 * fails fast (throws) if anything is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Supabase = identity provider only. The API verifies its RS256 JWTs against the
  // project JWKS; all RBAC lives here in Mongo. Optional so the app can boot for health
  // checks before Supabase is wired — the JWT service errors clearly if a protected
  // route is hit while unset.
  SUPABASE_JWKS_URI: z.string().min(1).optional(),
  SUPABASE_JWT_ISSUER: z.string().min(1).optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
  // JWKS cache TTL and the min interval between refetches when an unknown key id
  // (kid) appears — i.e. how Supabase key rotation is picked up.
  SUPABASE_JWKS_CACHE_MS: z.coerce.number().int().positive().default(600000),
  SUPABASE_JWKS_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(30000),
  // Shared secret for the Supabase user-sync webhook (create/update/delete).
  SUPABASE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Role assigned to a user on first login (lazy provisioning). Keep least-privilege;
  // gate Supabase sign-ups (invite-only) in production.
  AUTH_DEFAULT_ROLE: z.string().min(1).default("cashier"),

  // Rate limiting (Redis-backed). Defaults are per-IP across all routes.
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Trust X-Forwarded-* only from these proxies so req.ip (used for rate-limit keys and
  // audit IP attribution) is the real client. Unset = don't trust (correct for direct/dev).
  // Accepts "true"/"false", a hop count, or a comma-separated CIDR/IP list. Never blanket-
  // trust in front of an untrusted network — it lets clients spoof their IP.
  TRUSTED_PROXIES: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}
