import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

export type CashTransactionType = "SALE" | "PAYIN" | "PAYOUT" | "REFUND";

/**
 * Append-only drawer ledger for a cash session. `amount` is always positive; direction is
 * implied by `type` (SALE/PAYIN inflow, PAYOUT/REFUND outflow) — the source of truth for a
 * session's expectedCash at close.
 */
@Schema({ collection: "cash_transactions" })
export class CashTransaction {
  @Prop({ type: SchemaTypes.ObjectId, ref: "CashSession", required: true })
  sessionId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ["SALE", "PAYIN", "PAYOUT", "REFUND"] })
  type!: CashTransactionType;

  @Prop({ type: MoneyEmbedSchema, required: true })
  amount!: MoneyEmbed;

  @Prop()
  refType?: string;

  @Prop()
  refId?: string;

  @Prop()
  reason?: string;
}

export type CashTransactionDocument = HydratedDocument<CashTransaction>;
export const CashTransactionSchema = applyBaseSchema(SchemaFactory.createForClass(CashTransaction));

function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("cash_transactions is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
CashTransactionSchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
CashTransactionSchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("cash_transactions is append-only and immutable");
  }
  if (typeof next === "function") next();
});

CashTransactionSchema.index({ sessionId: 1, createdAt: 1 });
