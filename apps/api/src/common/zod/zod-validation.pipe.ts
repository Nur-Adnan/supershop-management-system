import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import type { ZodType } from "zod";
import { DomainException } from "../domain.exception";

/**
 * Global pipe. If a route param's metatype carries a `zodSchema` (a createZodDto class),
 * the value is parsed against it — validating, coercing, and stripping/ rejecting unknown
 * fields. Plain params (strings, untyped bodies) pass through untouched.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as { zodSchema?: ZodType } | undefined)?.zodSchema;
    if (!schema) return value;

    const result = schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Validation failed", 400, details);
    }
    return result.data;
  }
}
