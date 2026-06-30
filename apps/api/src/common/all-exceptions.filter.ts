import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type ApiFailure, ErrorCode } from "@supershop/shared";
import { isDuplicateKeyError } from "./mongo.util";

const STATUS_TO_CODE: Record<number, string> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Maps every thrown error to the problem envelope { success:false, error:{ code, message, details? } }.
 * Never leaks stack traces or raw Mongo errors to clients; 5xx are logged server-side.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();

    const { status, body } = this.normalize(exception);
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    void reply.status(status).send(body);
  }

  private normalize(exception: unknown): { status: number; body: ApiFailure } {
    if (isDuplicateKeyError(exception)) {
      return this.fail(409, ErrorCode.CONFLICT, "Resource already exists", exception.keyValue);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === "string") {
        return this.fail(status, this.codeFor(status), res);
      }

      const obj = res as Record<string, unknown>;
      // class-validator throws { message: string[] , error, statusCode }
      if (Array.isArray(obj.message)) {
        return this.fail(status, ErrorCode.VALIDATION_ERROR, "Validation failed", obj.message);
      }
      const code = (obj.code as string | undefined) ?? this.codeFor(status);
      const message = (obj.message as string | undefined) ?? exception.message;
      return this.fail(status, code, message, obj.details);
    }

    return this.fail(500, ErrorCode.INTERNAL_ERROR, "Internal server error");
  }

  private codeFor(status: number): string {
    return (
      STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST)
    );
  }

  private fail(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ): { status: number; body: ApiFailure } {
    const error = details === undefined ? { code, message } : { code, message, details };
    return { status, body: { success: false, error } };
  }
}
