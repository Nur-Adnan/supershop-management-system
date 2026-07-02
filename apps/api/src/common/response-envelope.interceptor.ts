import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { map, type Observable } from "rxjs";
import { Page } from "./pagination/page";

/**
 * Wraps successful responses in { success: true, data }, or { success, data: items, meta }
 * for a Page. Health probes keep their own raw contract.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const skip = req.url?.startsWith("/health") ?? false;
    return next.handle().pipe(
      map((data) => {
        if (skip) return data;
        if (data instanceof Page) return { success: true, data: data.items, meta: data.meta };
        return { success: true, data };
      }),
    );
  }
}
