import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ collection: "customers" })
export class Customer {
  @Prop({ required: true })
  name!: string;

  /** Primary POS lookup key, unique when present. */
  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop()
  email?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "CustomerGroup" })
  groupId?: Types.ObjectId;

  @Prop({ default: 0 })
  loyaltyPoints!: number;

  /** Max outstanding credit. Integer minor units. */
  @Prop({ type: MoneyEmbedSchema, default: () => ({ amount: 0, currency: "BDT" }) })
  creditLimit!: MoneyEmbed;

  /** Ledger opening balance (owed by customer). Integer minor units. */
  @Prop({ type: MoneyEmbedSchema, default: () => ({ amount: 0, currency: "BDT" }) })
  openingBalance!: MoneyEmbed;

  @Prop({ default: true })
  isActive!: boolean;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = applyBaseSchema(SchemaFactory.createForClass(Customer), {
  softDelete: true,
});
