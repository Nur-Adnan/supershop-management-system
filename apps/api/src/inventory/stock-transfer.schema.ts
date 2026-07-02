import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ _id: false })
export class TransferLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  qty!: number;
}
const TransferLineSchema = SchemaFactory.createForClass(TransferLine);

/**
 * Inter-store transfer. Phase 5 posts transfers atomically (TRANSFER_OUT at source +
 * TRANSFER_IN at destination in one transaction), so they land as RECEIVED. A staged
 * DRAFT → IN_TRANSIT → RECEIVED workflow (goods-in-transit) is a later refinement.
 */
@Schema({ collection: "stock_transfers" })
export class StockTransfer {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  fromStoreId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  toStoreId!: Types.ObjectId;

  @Prop({ type: [TransferLineSchema], default: [] })
  lines!: TransferLine[];

  @Prop({
    type: String,
    required: true,
    enum: ["DRAFT", "IN_TRANSIT", "RECEIVED"],
    default: "RECEIVED",
  })
  status!: "DRAFT" | "IN_TRANSIT" | "RECEIVED";
}

export type StockTransferDocument = HydratedDocument<StockTransfer>;
export const StockTransferSchema = applyBaseSchema(SchemaFactory.createForClass(StockTransfer));
StockTransferSchema.index({ fromStoreId: 1, createdAt: -1 });
StockTransferSchema.index({ toStoreId: 1, createdAt: -1 });
