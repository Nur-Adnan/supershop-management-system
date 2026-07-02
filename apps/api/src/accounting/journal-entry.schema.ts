import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { SUPPORTED_CURRENCIES, type Currency } from "@supershop/shared";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ _id: false })
export class JournalLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Account", required: true })
  accountId!: Types.ObjectId;

  /** Integer minor units. Exactly one of debit/credit is > 0 (enforced in JournalService). */
  @Prop({ required: true, default: 0 })
  debit!: number;

  @Prop({ required: true, default: 0 })
  credit!: number;
}
const JournalLineSchema = SchemaFactory.createForClass(JournalLine);

/**
 * Double-entry ledger posting — append-only (like stock_movements/payments/audit_logs). A
 * correction is made by posting an equal-and-opposite reversing entry (see JournalService.reverse),
 * never by editing. Σdebit === Σcredit is enforced by JournalService before this is ever written.
 */
@Schema({ collection: "journal_entries" })
export class JournalEntry {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ type: [JournalLineSchema], default: [] })
  lines!: JournalLine[];

  @Prop({ type: String, required: true, enum: [...SUPPORTED_CURRENCIES] })
  currency!: Currency;

  @Prop()
  refType?: string;

  @Prop()
  refId?: string;

  @Prop()
  description?: string;

  /** Set when this entry reverses another (see JournalService.reverse). */
  @Prop({ type: SchemaTypes.ObjectId, ref: "JournalEntry" })
  reversalOfId?: Types.ObjectId;
}

export type JournalEntryDocument = HydratedDocument<JournalEntry>;
export const JournalEntrySchema = applyBaseSchema(SchemaFactory.createForClass(JournalEntry));

function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("journal_entries is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
JournalEntrySchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
JournalEntrySchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("journal_entries is append-only and immutable");
  }
  if (typeof next === "function") next();
});

JournalEntrySchema.index({ refType: 1, refId: 1 });
JournalEntrySchema.index({ date: -1 });
JournalEntrySchema.index({ "lines.accountId": 1, date: -1 });
