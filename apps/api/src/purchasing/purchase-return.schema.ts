import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ _id: false })
export class PurchaseReturnLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  qty!: number;
}
const PurchaseReturnLineSchema = SchemaFactory.createForClass(PurchaseReturnLine);

/** Goods sent back to a supplier. FEFO-consumes the returned quantity from the store (Hard Rule 4). */
@Schema({ collection: "purchase_returns" })
export class PurchaseReturn {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Supplier", required: true })
  supplierId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "GoodsReceipt" })
  grnId?: Types.ObjectId;

  @Prop({ type: [PurchaseReturnLineSchema], default: [] })
  lines!: PurchaseReturnLine[];

  @Prop({ required: true })
  reason!: string;
}

export type PurchaseReturnDocument = HydratedDocument<PurchaseReturn>;
export const PurchaseReturnSchema = applyBaseSchema(SchemaFactory.createForClass(PurchaseReturn));
PurchaseReturnSchema.index({ supplierId: 1, createdAt: -1 });
PurchaseReturnSchema.index({ storeId: 1, createdAt: -1 });
