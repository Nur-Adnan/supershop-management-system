import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

/** A received lot of a product at a store. FEFO consumes these by `expiryDate` (soonest first). */
@Schema({ collection: "stock_batches" })
export class StockBatch {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop()
  batchNo?: string;

  @Prop({ type: Date, default: null })
  expiryDate?: Date | null;

  @Prop({ required: true, default: 0 })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  costPrice!: MoneyEmbed;

  @Prop({ type: Date })
  receivedAt?: Date;
}

export type StockBatchDocument = HydratedDocument<StockBatch>;
export const StockBatchSchema = applyBaseSchema(SchemaFactory.createForClass(StockBatch));
// FEFO selection: all live batches for a (product, store) ordered by expiry.
StockBatchSchema.index({ productId: 1, storeId: 1, expiryDate: 1 });
