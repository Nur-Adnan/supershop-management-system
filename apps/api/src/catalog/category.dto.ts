import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const categoryCreateSchema = z
  .object({
    name: z.string().min(1).max(128),
    parentId: objectId.nullable().optional(),
    description: z.string().max(512).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateCategoryDto extends createZodDto(categoryCreateSchema) {}

export const categoryUpdateSchema = categoryCreateSchema.partial();
export class UpdateCategoryDto extends createZodDto(categoryUpdateSchema) {}
