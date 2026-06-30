import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { catchError, concatMap, from, type Observable, of, throwError } from "rxjs";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { IDEMPOTENT_KEY } from "./idempotent.decorator";
import { IdempotencyService } from "./idempotency.service";

function hashRequest(method: string, url: string, body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ method, url, body: body ?? null }))
    .digest("hex");
}

/**
 * Enforces idempotency on routes marked @Idempotent(): requires the header, replays
 * the stored result on a repeat, and 409s on key-reuse-with-different-payload or an
 * in-flight request. On handler error the reservation is released so the client may retry.
 *
 * NOTE: completion is written just after the handler (not inside its transaction). For
 * the highest-stakes endpoints (POS checkout, GRN), call IdempotencyService.complete(key,
 * ..., session) inside the business transaction instead — see Phase 7.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Idempotency");

  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return next.handle();

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const key = (req.headers["idempotency-key"] as string | undefined)?.trim();
    if (!key) {
      throw new DomainException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        "Idempotency-Key header is required",
        400,
      );
    }

    const requestHash = hashRequest(req.method, req.url, req.body);
    const reservation = await this.idempotency.reserve({
      key,
      endpoint: req.url,
      method: req.method,
      requestHash,
    });

    if (reservation.replay) {
      const { record } = reservation;
      if (record.requestHash && record.requestHash !== requestHash) {
        throw new DomainException(
          ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
          "Idempotency-Key was reused with a different request",
          409,
        );
      }
      if (record.state !== "COMPLETED") {
        throw new DomainException(
          ErrorCode.IDEMPOTENCY_IN_PROGRESS,
          "A request with this Idempotency-Key is still in progress",
          409,
        );
      }
      void reply.header("Idempotent-Replayed", "true");
      return of(record.result);
    }

    return next.handle().pipe(
      concatMap(async (value) => {
        try {
          await this.idempotency.complete(key, value);
        } catch (err) {
          // Business action already succeeded; don't fail the response. Replays will
          // 409 until the TTL clears the IN_PROGRESS record.
          this.logger.error(`Failed to persist idempotency result for ${key}`, err as Error);
        }
        return value;
      }),
      catchError((err) =>
        from(this.idempotency.release(key)).pipe(concatMap(() => throwError(() => err))),
      ),
    );
  }
}
