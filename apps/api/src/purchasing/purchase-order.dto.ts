import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const poLine = z
  .object({
    productId: objectId,
    qty: z.number().positive(),
    unitCost: nonNegativeMoneySchema,
  })
  .strict();

function noDuplicateProducts(lines: Array<{ productId: string }>): boolean {
  return new Set(lines.map((l) => l.productId)).size === lines.length;
}
function sameCurrency(lines: Array<{ unitCost: { currency: string } }>): boolean {
  return new Set(lines.map((l) => l.unitCost.currency)).size <= 1;
}

export const createPurchaseOrderSchema = z
  .object({
    supplierId: objectId,
    storeId: objectId,
    lines: z.array(poLine).min(1).max(500),
    notes: z.string().max(1024).optional(),
  })
  .strict()
  .refine((v) => noDuplicateProducts(v.lines), {
    message: "Duplicate productId in lines",
    path: ["lines"],
  })
  .refine((v) => sameCurrency(v.lines), {
    message: "All lines must use the same currency",
    path: ["lines"],
  });
export class CreatePurchaseOrderDto extends createZodDto(createPurchaseOrderSchema) {}

export const updatePurchaseOrderSchema = z
  .object({
    lines: z.array(poLine).min(1).max(500).optional(),
    notes: z.string().max(1024).optional(),
  })
  .strict()
  .refine((v) => !v.lines || noDuplicateProducts(v.lines), {
    message: "Duplicate productId in lines",
    path: ["lines"],
  })
  .refine((v) => !v.lines || sameCurrency(v.lines), {
    message: "All lines must use the same currency",
    path: ["lines"],
  });
export class UpdatePurchaseOrderDto extends createZodDto(updatePurchaseOrderSchema) {}
