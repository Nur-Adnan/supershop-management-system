import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const receiveLine = z
  .object({
    productId: objectId,
    qty: z.number().positive(),
    costPrice: nonNegativeMoneySchema,
    batchNo: z.string().min(1).max(64).optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict();

export const receiveSchema = z
  .object({
    storeId: objectId,
    lines: z.array(receiveLine).min(1).max(500),
  })
  .strict();
export class ReceiveStockDto extends createZodDto(receiveSchema) {}

const adjustLine = z
  .object({
    productId: objectId,
    qty: z.number().refine((n) => n !== 0, "Adjustment qty cannot be zero"),
    costPrice: nonNegativeMoneySchema.optional(),
    batchNo: z.string().min(1).max(64).optional(),
    expiryDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((l) => l.qty < 0 || l.costPrice !== undefined, {
    message: "costPrice is required for a positive adjustment",
    path: ["costPrice"],
  });

export const adjustSchema = z
  .object({
    storeId: objectId,
    reason: z.string().min(1).max(256),
    lines: z.array(adjustLine).min(1).max(500),
  })
  .strict();
export class AdjustStockDto extends createZodDto(adjustSchema) {}

const transferLine = z.object({ productId: objectId, qty: z.number().positive() }).strict();

export const transferSchema = z
  .object({
    fromStoreId: objectId,
    toStoreId: objectId,
    lines: z.array(transferLine).min(1).max(500),
  })
  .strict();
export class TransferStockDto extends createZodDto(transferSchema) {}
