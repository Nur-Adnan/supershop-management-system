import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

export const createAccountSchema = z
  .object({
    code: z.string().min(1).max(32),
    name: z.string().min(1).max(128),
    type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
    parentId: objectId.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export class CreateAccountDto extends createZodDto(createAccountSchema) {}

export const updateAccountSchema = createAccountSchema.omit({ type: true }).partial();
export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}
