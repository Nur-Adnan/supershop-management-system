import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { canAccessStore } from "./authz";
import { STORE_SCOPE_KEY } from "./decorators";

function extractStoreId(req: FastifyRequest, source: string): string | undefined {
  const [container, key] = source.split(".");
  if (!container || !key) return undefined;
  const bag = (req as unknown as Record<string, unknown>)[container];
  if (typeof bag !== "object" || bag === null) return undefined;
  const value = (bag as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

@Injectable()
export class StoreScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const source = this.reflector.getAllAndOverride<string>(STORE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!source) return true; // route is not store-scoped

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = req.principal;
    if (!principal) {
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Not authenticated", 401);
    }
    const storeId = extractStoreId(req, source);
    if (!storeId) {
      throw new DomainException(ErrorCode.BAD_REQUEST, `Missing storeId at '${source}'`, 400);
    }
    if (!canAccessStore(principal, storeId)) {
      throw new DomainException(ErrorCode.FORBIDDEN, "You may not act on this store", 403);
    }
    return true;
  }
}
