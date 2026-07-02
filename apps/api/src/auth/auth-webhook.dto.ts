import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const recordSchema = z
  .object({ id: z.string().optional(), email: z.string().optional() })
  .passthrough()
  .nullable()
  .optional();

// Supabase sends extra top-level fields; the default Zod object strips unknowns rather than rejecting.
export const supabaseWebhookSchema = z.object({
  type: z.enum(["INSERT", "UPDATE", "DELETE"]),
  table: z.string().optional(),
  schema: z.string().optional(),
  record: recordSchema,
  old_record: recordSchema,
});

export class SupabaseWebhookDto extends createZodDto(supabaseWebhookSchema) {}
