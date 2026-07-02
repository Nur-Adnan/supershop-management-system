import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ _id: false })
export class GoodsReceiptLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  unitCost!: MoneyEmbed;

  @Prop()
  batchNo?: string;

  @Prop({ type: Date, default: null })
  expiryDate?: Date | null;
}
const GoodsReceiptLineSchema = SchemaFactory.createForClass(GoodsReceiptLine);

/**
 * GRN posting is immediate and final (no draft/staging concept) — creating the document IS the
 * posting action: it always lands with `status: POSTED` and its stock movements committed in the
 * same transaction (Hard Rule 2). There is currently no reversal path; a wrong receipt is corrected
 * via a stock adjustment or a purchase return, both of which append their own ledger entries.
 */
@Schema({ collection: "goods_receipts" })
export class GoodsReceipt {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "PurchaseOrder", required: true })
  poId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Supplier", required: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: [GoodsReceiptLineSchema], default: [] })
  lines!: GoodsReceiptLine[];

  @Prop({ type: String, required: true, enum: ["POSTED"], default: "POSTED" })
  status!: "POSTED";
}

export type GoodsReceiptDocument = HydratedDocument<GoodsReceipt>;
export const GoodsReceiptSchema = applyBaseSchema(SchemaFactory.createForClass(GoodsReceipt));
GoodsReceiptSchema.index({ poId: 1, createdAt: -1 });
GoodsReceiptSchema.index({ storeId: 1, createdAt: -1 });
