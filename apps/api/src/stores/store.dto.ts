import { SUPPORTED_CURRENCIES } from "@supershop/shared";
import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const taxConfigSchema = z
  .object({
    vatBps: z.number().int().min(0).max(100_000).default(0),
    pricesIncludeTax: z.boolean().default(false),
  })
  .strict();

export const storeCreateSchema = z
  .object({
    name: z.string().min(1).max(128),
    code: z.string().min(1).max(32),
    address: z.string().max(512).optional(),
    timezone: z.string().min(1).max(64).default("Asia/Dhaka"),
    currency: z.enum(SUPPORTED_CURRENCIES).default("BDT"),
    taxConfig: taxConfigSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateStoreDto extends createZodDto(storeCreateSchema) {}

export const storeUpdateSchema = storeCreateSchema.partial();
export class UpdateStoreDto extends createZodDto(storeUpdateSchema) {}
