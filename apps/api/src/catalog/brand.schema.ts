import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ collection: "brands" })
export class Brand {
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export type BrandDocument = HydratedDocument<Brand>;
export const BrandSchema = applyBaseSchema(SchemaFactory.createForClass(Brand), {
  softDelete: true,
});
