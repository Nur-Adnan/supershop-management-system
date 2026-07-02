import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const returnLine = z.object({ productId: objectId, qty: z.number().positive() }).strict();

export const createPurchaseReturnSchema = z
  .object({
    supplierId: objectId,
    storeId: objectId,
    grnId: objectId.optional(),
    reason: z.string().min(1).max(256),
    lines: z.array(returnLine).min(1).max(500),
  })
  .strict()
  .refine((v) => new Set(v.lines.map((l) => l.productId)).size === v.lines.length, {
    message: "Duplicate productId in lines",
    path: ["lines"],
  });
export class CreatePurchaseReturnDto extends createZodDto(createPurchaseReturnSchema) {}
