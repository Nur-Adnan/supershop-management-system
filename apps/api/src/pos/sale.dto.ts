import { PaymentMethod } from "@supershop/shared";
import { z } from "zod";
import { moneySchema, nonNegativeMoneySchema, positiveMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

const checkoutLine = z
  .object({
    productId: objectId,
    qty: z.number().positive(),
    /** Overrides the product's current sellPrice for this line (POS price override). */
    unitPrice: moneySchema.optional(),
  })
  .strict();

const checkoutPayment = z
  .object({
    method: z.enum(PaymentMethod),
    amount: positiveMoneySchema,
  })
  .strict();

export const checkoutSchema = z
  .object({
    storeId: objectId,
    cashSessionId: objectId,
    customerId: objectId.optional(),
    lines: z.array(checkoutLine).min(1).max(500),
    discountTotal: nonNegativeMoneySchema.optional(),
    promotionCode: z.string().min(1).max(32).optional(),
    redeemPoints: z.number().int().positive().optional(),
    payments: z.array(checkoutPayment).min(1).max(10),
  })
  .strict();
export class CheckoutDto extends createZodDto(checkoutSchema) {}
