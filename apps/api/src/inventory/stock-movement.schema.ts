import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { StockMovementType } from "@supershop/shared";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

/**
 * Append-only ledger of every stock change — the SOURCE OF TRUTH (Hard Rule 5). `qty` is
 * signed (+ inbound, - outbound). Immutable at the schema layer (defense in depth), like audit_logs.
 */
@Schema({ collection: "stock_movements" })
export class StockMovement {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "StockBatch" })
  batchId?: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(StockMovementType) })
  type!: StockMovementType;

  /** Signed quantity: positive = into stock, negative = out of stock. */
  @Prop({ required: true })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema })
  unitCost?: MoneyEmbed;

  /** What caused the movement, e.g. "receipt" | "adjustment" | "transfer" | "sale". */
  @Prop()
  refType?: string;

  @Prop()
  refId?: string;

  @Prop()
  reason?: string;
}

export type StockMovementDocument = HydratedDocument<StockMovement>;
export const StockMovementSchema = applyBaseSchema(SchemaFactory.createForClass(StockMovement));

// Append-only: reject every update/delete/replace query at the schema layer (defense in depth).
function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("stock_movements is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
StockMovementSchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
StockMovementSchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("stock_movements is append-only and immutable");
  }
  if (typeof next === "function") next();
});

StockMovementSchema.index({ storeId: 1, createdAt: 1 });
StockMovementSchema.index({ productId: 1, storeId: 1, createdAt: 1 });
StockMovementSchema.index({ refType: 1, refId: 1 });
