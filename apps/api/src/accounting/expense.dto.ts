import { PaymentMethod } from "@supershop/shared";
import { z } from "zod";
import { positiveMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const createExpenseSchema = z
  .object({
    accountId: objectId,
    amount: positiveMoneySchema,
    storeId: objectId.optional(),
    paidVia: z.enum(PaymentMethod),
    description: z.string().min(1).max(512),
  })
  .strict();
export class CreateExpenseDto extends createZodDto(createExpenseSchema) {}
