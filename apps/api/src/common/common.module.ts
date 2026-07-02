import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { AuditInterceptor } from "../audit/audit.interceptor";
import { IdempotencyInterceptor } from "../idempotency/idempotency.interceptor";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "./response-envelope.interceptor";
import { ZodValidationPipe } from "./zod/zod-validation.pipe";

/**
 * Cross-cutting concerns applied globally. Interceptor order matters: the envelope is
 * outermost so it wraps both fresh and idempotency-replayed responses; audit is innermost
 * so it taps the raw handler result.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class CommonModule {}
