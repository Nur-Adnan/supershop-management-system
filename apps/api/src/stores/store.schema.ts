import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type Currency, SUPPORTED_CURRENCIES } from "@supershop/shared";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ _id: false })
export class StoreTaxConfig {
  /** Default VAT rate in basis points (1% = 100 bps). */
  @Prop({ default: 0 })
  vatBps!: number;

  @Prop({ default: false })
  pricesIncludeTax!: boolean;
}
const StoreTaxConfigSchema = SchemaFactory.createForClass(StoreTaxConfig);

@Schema({ collection: "stores" })
export class Store {
  @Prop({ required: true })
  name!: string;

  /** Short branch code, unique across stores. */
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop()
  address?: string;

  @Prop({ required: true, default: "Asia/Dhaka" })
  timezone!: string;

  @Prop({ type: String, required: true, enum: [...SUPPORTED_CURRENCIES], default: "BDT" })
  currency!: Currency;

  @Prop({ type: StoreTaxConfigSchema, default: () => ({}) })
  taxConfig!: StoreTaxConfig;

  @Prop({ default: true })
  isActive!: boolean;
}

export type StoreDocument = HydratedDocument<Store>;
export const StoreSchema = applyBaseSchema(SchemaFactory.createForClass(Store), {
  softDelete: true,
});
