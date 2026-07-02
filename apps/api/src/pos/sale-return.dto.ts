import { PaymentMethod } from "@supershop/shared";
import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const returnLine = z.object({ productId: objectId, qty: z.number().positive() }).strict();

export const createSaleReturnSchema = z
  .object({
    saleId: objectId,
    cashSessionId: objectId,
    refundMethod: z.enum(PaymentMethod),
    reason: z.string().min(1).max(256),
    lines: z.array(returnLine).min(1).max(500),
  })
  .strict()
  .refine((v) => new Set(v.lines.map((l) => l.productId)).size === v.lines.length, {
    message: "Duplicate productId in lines",
    path: ["lines"],
  });
export class CreateSaleReturnDto extends createZodDto(createSaleReturnSchema) {}
