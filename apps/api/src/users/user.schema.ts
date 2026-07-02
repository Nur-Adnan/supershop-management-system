import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ collection: "users" })
export class User {
  /** Supabase auth user id (the JWT `sub`). The link between IdP and our records. */
  @Prop({ required: true, unique: true })
  supabaseId!: string;

  @Prop({ required: true })
  email!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Role", required: true })
  roleId!: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: "Store", default: [] })
  storeIds!: Types.ObjectId[];

  @Prop({ type: SchemaTypes.ObjectId, ref: "Employee" })
  employeeId?: Types.ObjectId;

  @Prop({ required: true, enum: ["active", "disabled"], default: "active" })
  status!: "active" | "disabled";

  @Prop()
  displayName?: string;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = applyBaseSchema(SchemaFactory.createForClass(User), { softDelete: true });
