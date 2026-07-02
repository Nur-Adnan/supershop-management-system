import { SetMetadata } from "@nestjs/common";

export const AUDIT_KEY = "audit";

export interface AuditMeta {
  action: string;
  entityType: string;
}

/**
 * Coarse audit logging: records actor/action/result after a successful handler (best-effort,
 * not in the handler's transaction). For before/after diffs that must be atomic with the
 * mutation, call AuditService.record(..., session) inside the service's withTransaction instead.
 */
export const Audited = (action: string, entityType: string): MethodDecorator =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMeta);
