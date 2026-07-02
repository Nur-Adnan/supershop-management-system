import { z } from "zod";
import { moneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const pricingSchema = z
  .object({
    costPrice: moneySchema,
    sellPrice: moneySchema,
    mrp: moneySchema.optional(),
  })
  .strict();

export const productCreateSchema = z
  .object({
    sku: z.string().min(1).max(64),
    barcodes: z.array(z.string().min(1)).default([]),
    name: z.string().min(1).max(200),
    categoryId: objectId,
    brandId: objectId.optional(),
    unitId: objectId,
    pricing: pricingSchema,
    taxRateBps: z.number().int().min(0).max(100_000).default(0),
    isWeighted: z.boolean().default(false),
    reorderLevel: z.number().int().min(0).default(0),
    images: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateProductDto extends createZodDto(productCreateSchema) {}

export const productUpdateSchema = productCreateSchema.partial();
export class UpdateProductDto extends createZodDto(productUpdateSchema) {}

// Rows stay loose here so one bad row doesn't reject the whole batch; each is validated
// against productCreateSchema inside the service, producing a per-row result.
export const productBulkSchema = z.object({ rows: z.array(z.unknown()).min(1).max(1000) }).strict();
export class ProductBulkDto extends createZodDto(productBulkSchema) {}
