import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PaymentMethod } from "@supershop/shared";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ _id: false })
export class SaleReturnLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  refundAmount!: MoneyEmbed;
}
const SaleReturnLineSchema = SchemaFactory.createForClass(SaleReturnLine);

@Schema({ collection: "sale_returns" })
export class SaleReturn {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Sale", required: true })
  saleId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Customer" })
  customerId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "CashSession", required: true })
  cashSessionId!: Types.ObjectId;

  @Prop({ type: [SaleReturnLineSchema], default: [] })
  lines!: SaleReturnLine[];

  @Prop({ type: String, required: true, enum: Object.values(PaymentMethod) })
  refundMethod!: PaymentMethod;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: MoneyEmbedSchema, required: true })
  total!: MoneyEmbed;
}

export type SaleReturnDocument = HydratedDocument<SaleReturn>;
export const SaleReturnSchema = applyBaseSchema(SchemaFactory.createForClass(SaleReturn));
SaleReturnSchema.index({ saleId: 1, createdAt: -1 });
SaleReturnSchema.index({ storeId: 1, createdAt: -1 });
