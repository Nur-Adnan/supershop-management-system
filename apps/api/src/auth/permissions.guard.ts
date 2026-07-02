import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { hasAllPermissions } from "./authz";
import { PERMISSIONS_KEY } from "./decorators";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    if (!principal) {
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Not authenticated", 401);
    }
    if (!hasAllPermissions(principal, required)) {
      throw new DomainException(
        ErrorCode.FORBIDDEN,
        `Missing required permission(s): ${required.join(", ")}`,
        403,
      );
    }
    return true;
  }
}
