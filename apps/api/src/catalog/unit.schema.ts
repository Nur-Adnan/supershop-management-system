import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";

/**
 * Unit of measure. `allowDecimal`/`precision` drive weighted-goods handling: a product sold
 * by weight must reference a unit with `allowDecimal: true` (enforced in ProductsService).
 */
@Schema({ collection: "units" })
export class Unit {
  @Prop({ required: true })
  name!: string;

  /** Short symbol, unique across units, e.g. "kg", "pc", "L". */
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true, default: 0, min: 0, max: 6 })
  precision!: number;

  @Prop({ required: true, default: false })
  allowDecimal!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export type UnitDocument = HydratedDocument<Unit>;
export const UnitSchema = applyBaseSchema(SchemaFactory.createForClass(Unit), { softDelete: true });
