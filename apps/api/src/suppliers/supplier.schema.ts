import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ _id: false })
export class SupplierContact {
  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;
}
const SupplierContactSchema = SchemaFactory.createForClass(SupplierContact);

@Schema({ collection: "suppliers" })
export class Supplier {
  @Prop({ required: true })
  name!: string;

  /** Optional vendor code, unique when present. */
  @Prop({ unique: true, sparse: true })
  code?: string;

  @Prop({ type: SupplierContactSchema, default: () => ({}) })
  contact!: SupplierContact;

  @Prop()
  paymentTerms?: string;

  /** Ledger opening balance (owed to supplier). Integer minor units. */
  @Prop({ type: MoneyEmbedSchema, default: () => ({ amount: 0, currency: "BDT" }) })
  openingBalance!: MoneyEmbed;

  @Prop({ default: true })
  isActive!: boolean;
}

export type SupplierDocument = HydratedDocument<Supplier>;
export const SupplierSchema = applyBaseSchema(SchemaFactory.createForClass(Supplier), {
  softDelete: true,
});
