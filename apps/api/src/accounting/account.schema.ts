import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import type { AccountType } from "./system-accounts";

/** Chart-of-accounts entry. `parentId` gives a tree (e.g. sub-accounts under a control account). */
@Schema({ collection: "accounts" })
export class Account {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    enum: ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"],
  })
  type!: AccountType;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Account", default: null })
  parentId?: Types.ObjectId | null;

  /** Seeded accounts (see system-accounts.ts) — not editable/deletable via the API. */
  @Prop({ default: false })
  isSystem!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export type AccountDocument = HydratedDocument<Account>;
export const AccountSchema = applyBaseSchema(SchemaFactory.createForClass(Account));
AccountSchema.index({ parentId: 1 });
AccountSchema.index({ type: 1 });
