import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { IdempotencyInterceptor } from "../idempotency/idempotency.interceptor";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { ResponseEnvelopeInterceptor } from "./response-envelope.interceptor";

/**
 * Cross-cutting concerns applied globally. Interceptor order matters: the envelope
 * is outermost so it wraps both fresh and idempotency-replayed responses uniformly.
 */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class CommonModule {}
