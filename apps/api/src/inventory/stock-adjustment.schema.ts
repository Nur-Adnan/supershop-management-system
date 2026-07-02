import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ _id: false })
export class AdjustmentLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  /** Signed: positive = found/added, negative = wastage/loss (FEFO-consumed). */
  @Prop({ required: true })
  qty!: number;

  @Prop()
  batchNo?: string;

  @Prop({ type: Date })
  expiryDate?: Date | null;

  /** Cost for positive adjustments (creating stock). */
  @Prop({ type: MoneyEmbedSchema })
  costPrice?: MoneyEmbed;
}
const AdjustmentLineSchema = SchemaFactory.createForClass(AdjustmentLine);

@Schema({ collection: "stock_adjustments" })
export class StockAdjustment {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: [AdjustmentLineSchema], default: [] })
  lines!: AdjustmentLine[];

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User" })
  approvedBy?: Types.ObjectId;
}

export type StockAdjustmentDocument = HydratedDocument<StockAdjustment>;
export const StockAdjustmentSchema = applyBaseSchema(SchemaFactory.createForClass(StockAdjustment));
StockAdjustmentSchema.index({ storeId: 1, createdAt: -1 });
