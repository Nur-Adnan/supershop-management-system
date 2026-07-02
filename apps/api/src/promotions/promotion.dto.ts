import { PromotionType } from "@supershop/shared";
import { z } from "zod";
import { nonNegativeMoneySchema } from "../common/zod/money.zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const createPromotionSchema = z
  .object({
    code: z.string().min(1).max(32),
    name: z.string().min(1).max(200),
    type: z.enum(PromotionType),
    valueBps: z.number().int().positive().max(100_000).optional(),
    valueAmount: nonNegativeMoneySchema.optional(),
    minSubtotal: nonNegativeMoneySchema.optional(),
    productIds: z.array(objectId).default([]),
    categoryIds: z.array(objectId).default([]),
    customerGroupIds: z.array(objectId).default([]),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date(),
    usageLimit: z.number().int().positive().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreatePromotionDto extends createZodDto(createPromotionSchema) {}

// `type` is immutable after creation (which of valueBps/valueAmount applies is fixed by it).
export const updatePromotionSchema = createPromotionSchema.omit({ type: true }).partial();
export class UpdatePromotionDto extends createZodDto(updatePromotionSchema) {}
