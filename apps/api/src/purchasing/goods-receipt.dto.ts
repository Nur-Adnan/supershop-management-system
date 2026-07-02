import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const grnLine = z
  .object({
    productId: objectId,
    qty: z.number().positive(),
    /** Defaults to the PO line's unitCost when omitted. */
    unitCost: nonNegativeMoneySchema.optional(),
    batchNo: z.string().min(1).max(64).optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict();

export const createGoodsReceiptSchema = z
  .object({
    poId: objectId,
    lines: z.array(grnLine).min(1).max(500),
  })
  .strict()
  .refine((v) => new Set(v.lines.map((l) => l.productId)).size === v.lines.length, {
    message: "Duplicate productId in lines",
    path: ["lines"],
  });
export class CreateGoodsReceiptDto extends createZodDto(createGoodsReceiptSchema) {}
