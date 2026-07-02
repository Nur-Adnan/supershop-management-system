import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

/** Category taxonomy tree. `parentId` is null for roots; existence + no-cycle enforced in service. */
@Schema({ collection: "categories" })
export class Category {
  @Prop({ required: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Category", default: null })
  parentId?: Types.ObjectId | null;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = applyBaseSchema(SchemaFactory.createForClass(Category), {
  softDelete: true,
});
CategorySchema.index({ parentId: 1 });
