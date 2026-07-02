import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

export const unitCreateSchema = z
  .object({
    name: z.string().min(1).max(64),
    code: z.string().min(1).max(16),
    precision: z.number().int().min(0).max(6).default(0),
    allowDecimal: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateUnitDto extends createZodDto(unitCreateSchema) {}

export const unitUpdateSchema = unitCreateSchema.partial();
export class UpdateUnitDto extends createZodDto(unitUpdateSchema) {}
