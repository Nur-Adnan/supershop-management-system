import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

export const customerGroupCreateSchema = z
  .object({
    name: z.string().min(1).max(128),
    discountBps: z.number().int().min(0).max(100_000).default(0),
    description: z.string().max(512).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateCustomerGroupDto extends createZodDto(customerGroupCreateSchema) {}

export const customerGroupUpdateSchema = customerGroupCreateSchema.partial();
export class UpdateCustomerGroupDto extends createZodDto(customerGroupUpdateSchema) {}
