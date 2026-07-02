import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PaymentMethod } from "@supershop/shared";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

/** An operating expense. Posts one journal entry atomically: Dr accountId, Cr the settling
 * cash/AR account for paidVia (see system-accounts.ts's cashAccountForMethod). */
@Schema({ collection: "expenses" })
export class Expense {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Account", required: true })
  accountId!: Types.ObjectId;

  @Prop({ type: MoneyEmbedSchema, required: true })
  amount!: MoneyEmbed;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store" })
  storeId?: Types.ObjectId;

  @Prop({ type: String, required: true, enum: Object.values(PaymentMethod) })
  paidVia!: PaymentMethod;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "JournalEntry", required: true })
  journalEntryId!: Types.ObjectId;
}

export type ExpenseDocument = HydratedDocument<Expense>;
export const ExpenseSchema = applyBaseSchema(SchemaFactory.createForClass(Expense));
ExpenseSchema.index({ accountId: 1, createdAt: -1 });
ExpenseSchema.index({ storeId: 1, createdAt: -1 });
