import type { z, ZodType } from "zod";

export interface ZodDtoClass<S extends ZodType = ZodType> {
  new (): z.infer<S>;
  zodSchema: S;
}

/**
 * Builds a DTO class that carries its Zod schema. The global ZodValidationPipe reads
 * `zodSchema` off the route's metatype and validates/strips. Use `.strict()` schemas to
 * reject unknown fields (forbidNonWhitelisted).
 */
export function createZodDto<S extends ZodType>(schema: S): ZodDtoClass<S> {
  class Dto {
    static zodSchema = schema;
  }
  return Dto as unknown as ZodDtoClass<S>;
}
