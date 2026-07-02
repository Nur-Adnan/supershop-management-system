import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Principal } from "./principal";

export const IS_PUBLIC_KEY = "isPublic";
export const PERMISSIONS_KEY = "requiredPermissions";
export const STORE_SCOPE_KEY = "storeScopeSource";

/** Skip authentication for this route (health probes, webhooks). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Require every listed permission (super_admin bypasses). */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Enforce that the caller may act on the request's store. `source` is a dotted path into
 * the request, e.g. "params.storeId" (default), "query.storeId", "body.storeId".
 */
export const StoreScope = (source = "params.storeId"): MethodDecorator & ClassDecorator =>
  SetMetadata(STORE_SCOPE_KEY, source);

/** Inject the resolved Principal into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<FastifyRequest>().principal,
);
