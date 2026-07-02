import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

/** Pricing/loyalty tier a customer can belong to. */
@Schema({ collection: "customer_groups" })
export class CustomerGroup {
  @Prop({ required: true, unique: true })
  name!: string;

  /** Group-wide discount in basis points (1% = 100 bps). */
  @Prop({ default: 0 })
  discountBps!: number;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export type CustomerGroupDocument = HydratedDocument<CustomerGroup>;
export const CustomerGroupSchema = applyBaseSchema(SchemaFactory.createForClass(CustomerGroup), {
  softDelete: true,
});
