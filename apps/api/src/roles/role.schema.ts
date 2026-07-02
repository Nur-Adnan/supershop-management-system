import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

@Schema({ collection: "roles" })
export class Role {
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({ default: false })
  isSystem!: boolean;

  @Prop()
  description?: string;
}

export type RoleDocument = HydratedDocument<Role>;
export const RoleSchema = applyBaseSchema(SchemaFactory.createForClass(Role));
