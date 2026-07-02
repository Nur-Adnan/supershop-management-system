import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { type Observable, tap } from "rxjs";
import { AUDIT_KEY, type AuditMeta } from "./audited.decorator";
import { AuditService } from "./audit.service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Audit");

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = req.principal;

    return next.handle().pipe(
      tap((result) => {
        const entityId = isRecord(result) && typeof result.id === "string" ? result.id : undefined;
        void this.audit
          .record({
            action: meta.action,
            entityType: meta.entityType,
            entityId,
            actorId: principal?.userId,
            actorEmail: principal?.email,
            after: isRecord(result) ? result : undefined,
            ip: req.ip,
          })
          .catch((err: unknown) => this.logger.error("Failed to write audit log", err as Error));
      }),
    );
  }
}
