import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import type { Env } from "../config/env";
import type { SupabaseClaims } from "./principal";

/**
 * Verifies Supabase-issued RS256 JWTs against the project JWKS. `createRemoteJWKSet`
 * caches keys (cacheMaxAge) and refetches on an unknown `kid` (cooldownDuration),
 * which transparently handles Supabase key rotation.
 */
@Injectable()
export class SupabaseJwtService {
  private readonly logger = new Logger("SupabaseJwt");
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer?: string;
  private readonly audience: string;

  constructor(config: ConfigService<Env, true>) {
    const uri = config.get("SUPABASE_JWKS_URI", { infer: true });
    this.issuer = config.get("SUPABASE_JWT_ISSUER", { infer: true });
    this.audience = config.get("SUPABASE_JWT_AUDIENCE", { infer: true });
    if (uri) {
      this.jwks = createRemoteJWKSet(new URL(uri), {
        cacheMaxAge: config.get("SUPABASE_JWKS_CACHE_MS", { infer: true }),
        cooldownDuration: config.get("SUPABASE_JWKS_COOLDOWN_MS", { infer: true }),
      });
    } else {
      this.logger.warn("SUPABASE_JWKS_URI not set — authentication will reject all tokens.");
    }
  }

  async verify(token: string): Promise<SupabaseClaims> {
    if (!this.jwks) {
      throw new DomainException(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Authentication is not configured (SUPABASE_JWKS_URI missing)",
        503,
      );
    }
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
    });
    if (!payload.sub) {
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Token is missing a subject", 401);
    }
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  }
}
