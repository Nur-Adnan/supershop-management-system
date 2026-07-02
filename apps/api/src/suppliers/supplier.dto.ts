import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const contactSchema = z
  .object({
    phone: z.string().max(32).optional(),
    email: z.string().max(128).optional(),
    address: z.string().max(512).optional(),
  })
  .strict();

export const supplierCreateSchema = z
  .object({
    name: z.string().min(1).max(160),
    code: z.string().min(1).max(32).optional(),
    contact: contactSchema.optional(),
    paymentTerms: z.string().max(64).optional(),
    openingBalance: nonNegativeMoneySchema.optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateSupplierDto extends createZodDto(supplierCreateSchema) {}

export const supplierUpdateSchema = supplierCreateSchema.partial();
export class UpdateSupplierDto extends createZodDto(supplierUpdateSchema) {}
