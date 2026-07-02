import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { UsersService } from "../users/users.service";
import { IS_PUBLIC_KEY } from "./decorators";
import { SupabaseJwtService } from "./supabase-jwt.service";

/**
 * Global authentication guard: verifies the Supabase JWT, lazily provisions the Mongo
 * user on first sight, and attaches the resolved Principal. Authorization (permissions,
 * store scope) is enforced by the guards that run after this one.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: SupabaseJwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Missing bearer token", 401);
    }

    const claims = await this.jwt.verify(header.slice(7)).catch((err: unknown) => {
      if (err instanceof DomainException) throw err;
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Invalid or expired token", 401);
    });

    const principal = await this.users.resolvePrincipal(claims.sub, claims.email);
    if (principal.status === "disabled") {
      throw new DomainException(ErrorCode.FORBIDDEN, "Account is disabled", 403);
    }

    req.principal = principal;
    return true;
  }
}
