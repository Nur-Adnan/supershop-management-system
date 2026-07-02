import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const customerCreateSchema = z
  .object({
    name: z.string().min(1).max(160),
    phone: z.string().min(1).max(32).optional(),
    email: z.string().max(128).optional(),
    groupId: objectId.optional(),
    loyaltyPoints: z.number().int().min(0).default(0),
    creditLimit: nonNegativeMoneySchema.optional(),
    openingBalance: nonNegativeMoneySchema.optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateCustomerDto extends createZodDto(customerCreateSchema) {}

export const customerUpdateSchema = customerCreateSchema.partial();
export class UpdateCustomerDto extends createZodDto(customerUpdateSchema) {}
