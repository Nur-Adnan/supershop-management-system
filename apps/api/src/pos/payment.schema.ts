import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PaymentDirection, PaymentMethod } from "@supershop/shared";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

/**
 * Polymorphic money in/out ledger (Hard Rule 5-adjacent: the record of what was actually
 * collected/paid, independent of the sale/return document it settles). Append-only.
 */
@Schema({ collection: "payments" })
export class Payment {
  @Prop({ type: String, required: true, enum: Object.values(PaymentDirection) })
  direction!: PaymentDirection;

  @Prop({ type: String, required: true, enum: Object.values(PaymentMethod) })
  method!: PaymentMethod;

  @Prop({ required: true })
  refType!: string;

  @Prop({ required: true })
  refId!: string;

  @Prop({ type: MoneyEmbedSchema, required: true })
  amount!: MoneyEmbed;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Customer" })
  customerId?: Types.ObjectId;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = applyBaseSchema(SchemaFactory.createForClass(Payment));

function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("payments is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
PaymentSchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
PaymentSchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("payments is append-only and immutable");
  }
  if (typeof next === "function") next();
});

PaymentSchema.index({ refType: 1, refId: 1 });
PaymentSchema.index({ method: 1, createdAt: 1 });
