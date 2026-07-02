import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

/**
 * Denormalized current-stock cache per (product, store). NOT the source of truth — the
 * stock_movements ledger is (Hard Rule 5). Updated in the SAME transaction as each movement.
 */
@Schema({ collection: "inventory" })
export class Inventory {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true, default: 0 })
  currentQty!: number;

  @Prop({ required: true, default: 0 })
  reservedQty!: number;
}

export type InventoryDocument = HydratedDocument<Inventory>;
export const InventorySchema = applyBaseSchema(SchemaFactory.createForClass(Inventory));
InventorySchema.index({ productId: 1, storeId: 1 }, { unique: true });
