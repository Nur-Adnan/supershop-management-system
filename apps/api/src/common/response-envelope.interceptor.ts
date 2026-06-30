import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { map, type Observable } from "rxjs";

/**
 * Wraps successful responses in { success: true, data }. Health probes keep their
 * own raw contract. Pagination `meta` is layered in by the pagination helpers (Phase 3).
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const skip = req.url?.startsWith("/health") ?? false;
    return next.handle().pipe(map((data) => (skip ? data : { success: true, data })));
  }
}
