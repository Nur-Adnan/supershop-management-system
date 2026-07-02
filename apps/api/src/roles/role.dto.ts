import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

export const createRoleSchema = z
  .object({
    name: z.string().min(1).max(64),
    permissions: z.array(z.string()).default([]),
    description: z.string().max(256).optional(),
  })
  .strict();

export class CreateRoleDto extends createZodDto(createRoleSchema) {}

export const updateRoleSchema = z
  .object({
    permissions: z.array(z.string()).optional(),
    description: z.string().max(256).optional(),
  })
  .strict();

export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
