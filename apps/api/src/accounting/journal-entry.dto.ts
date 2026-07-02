import { SUPPORTED_CURRENCIES } from "@supershop/shared";
import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "must be a 24-character hex ObjectId");

// Shape-level checks only (non-negative integers). The double-entry semantics — exactly one of
// debit/credit per line, and Σdebit === Σcredit — are business invariants enforced by
// assertBalancedEntry in JournalService, not duplicated here.
const journalLine = z
  .object({
    accountId: objectId,
    debit: z.number().int().nonnegative(),
    credit: z.number().int().nonnegative(),
  })
  .strict();

export const createJournalEntrySchema = z
  .object({
    lines: z.array(journalLine).min(2).max(100),
    currency: z.enum(SUPPORTED_CURRENCIES),
    description: z.string().max(512).optional(),
    refType: z.string().max(64).optional(),
    refId: z.string().max(64).optional(),
    date: z.coerce.date().optional(),
  })
  .strict();
export class CreateJournalEntryDto extends createZodDto(createJournalEntrySchema) {}
