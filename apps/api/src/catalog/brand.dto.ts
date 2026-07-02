import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

export const brandCreateSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().max(512).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateBrandDto extends createZodDto(brandCreateSchema) {}

export const brandUpdateSchema = brandCreateSchema.partial();
export class UpdateBrandDto extends createZodDto(brandUpdateSchema) {}
