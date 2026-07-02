import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

@Schema({ _id: false })
export class PurchaseOrderLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  unitCost!: MoneyEmbed;

  /** Cumulative quantity posted against this line by goods receipts. */
  @Prop({ required: true, default: 0 })
  receivedQty!: number;
}
const PurchaseOrderLineSchema = SchemaFactory.createForClass(PurchaseOrderLine);

@Schema({ collection: "purchase_orders" })
export class PurchaseOrder {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Supplier", required: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: [PurchaseOrderLineSchema], default: [] })
  lines!: PurchaseOrderLine[];

  @Prop({
    type: String,
    required: true,
    enum: ["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
    default: "DRAFT",
  })
  status!: PurchaseOrderStatus;

  @Prop({ type: MoneyEmbedSchema, required: true })
  total!: MoneyEmbed;

  @Prop()
  notes?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User" })
  approvedBy?: Types.ObjectId;
}

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;
export const PurchaseOrderSchema = applyBaseSchema(SchemaFactory.createForClass(PurchaseOrder));
PurchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
PurchaseOrderSchema.index({ storeId: 1, status: 1 });
