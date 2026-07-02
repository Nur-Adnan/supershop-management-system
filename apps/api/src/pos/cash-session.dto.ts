import { z } from "zod";
import { nonNegativeMoneySchema, positiveMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const openCashSessionSchema = z
  .object({
    storeId: objectId,
    terminalId: z.string().min(1).max(64),
    openingFloat: nonNegativeMoneySchema,
  })
  .strict();
export class OpenCashSessionDto extends createZodDto(openCashSessionSchema) {}

export const closeCashSessionSchema = z
  .object({
    closingCount: nonNegativeMoneySchema,
  })
  .strict();
export class CloseCashSessionDto extends createZodDto(closeCashSessionSchema) {}

export const cashInOutSchema = z
  .object({
    amount: positiveMoneySchema,
    reason: z.string().min(1).max(256),
  })
  .strict();
export class CashInOutDto extends createZodDto(cashInOutSchema) {}
