import { HttpException } from "@nestjs/common";
import type { ErrorCode } from "@supershop/shared";

/**
 * App-level exception that carries a stable machine-readable `code`. The global
 * exception filter renders it into the problem envelope.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    status: number,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
