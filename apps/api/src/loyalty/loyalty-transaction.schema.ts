import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { LoyaltyTransactionType } from "@supershop/shared";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

/**
 * Append-only ledger of every loyalty-point change — the source of truth, mirroring
 * stock_movements/journal_entries. `customer.loyaltyPoints` is a denormalized running balance
 * updated in the SAME transaction as each entry (same pattern as inventory.currentQty).
 */
@Schema({ collection: "loyalty_transactions" })
export class LoyaltyTransaction {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Customer", required: true })
  customerId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(LoyaltyTransactionType) })
  type!: LoyaltyTransactionType;

  /** Always positive — `type` determines whether this adds to or subtracts from the balance. */
  @Prop({ required: true })
  points!: number;

  @Prop()
  refType?: string;

  @Prop()
  refId?: string;

  @Prop()
  description?: string;
}

export type LoyaltyTransactionDocument = HydratedDocument<LoyaltyTransaction>;
export const LoyaltyTransactionSchema = applyBaseSchema(
  SchemaFactory.createForClass(LoyaltyTransaction),
);

function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("loyalty_transactions is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
LoyaltyTransactionSchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
LoyaltyTransactionSchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("loyalty_transactions is append-only and immutable");
  }
  if (typeof next === "function") next();
});

LoyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });
LoyaltyTransactionSchema.index({ refType: 1, refId: 1 });
