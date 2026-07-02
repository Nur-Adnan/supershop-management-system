import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PromotionType } from "@supershop/shared";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

/**
 * A discount code applied at checkout. `productIds`/`categoryIds`/`customerGroupIds` narrow
 * eligibility when set (empty/absent = applies cart-wide / to every customer). Exactly one of
 * `valueBps` (PERCENT) or `valueAmount` (FIXED) is set, matching `type` — enforced in
 * PromotionsService, not the schema (mirrors how JournalEntry's debit/credit split is a service
 * invariant, not a schema one).
 */
@Schema({ collection: "promotions" })
export class Promotion {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: Object.values(PromotionType) })
  type!: PromotionType;

  /** PERCENT only: discount rate in basis points (1% = 100 bps). */
  @Prop()
  valueBps?: number;

  /** FIXED only: flat discount, capped at the eligible subtotal so it never goes negative. */
  @Prop({ type: MoneyEmbedSchema })
  valueAmount?: MoneyEmbed;

  /** Cart subtotal must reach this before the promotion applies. */
  @Prop({ type: MoneyEmbedSchema })
  minSubtotal?: MoneyEmbed;

  /** Restricts the discount to these products' lines. Empty/absent = cart-wide. */
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: "Product" }], default: [] })
  productIds!: Types.ObjectId[];

  /** Restricts the discount to lines whose product is in one of these categories. */
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: "Category" }], default: [] })
  categoryIds!: Types.ObjectId[];

  /** Restricts eligibility to customers in one of these groups. Empty/absent = any customer. */
  @Prop({ type: [{ type: SchemaTypes.ObjectId, ref: "CustomerGroup" }], default: [] })
  customerGroupIds!: Types.ObjectId[];

  @Prop({ required: true })
  validFrom!: Date;

  @Prop({ required: true })
  validTo!: Date;

  /** Max number of times this code may be redeemed across all sales. Absent = unlimited. */
  @Prop()
  usageLimit?: number;

  /** Incremented atomically (in the checkout transaction) each time the code is applied. */
  @Prop({ default: 0 })
  usageCount!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export type PromotionDocument = HydratedDocument<Promotion>;
export const PromotionSchema = applyBaseSchema(SchemaFactory.createForClass(Promotion), {
  softDelete: true,
});

PromotionSchema.index({ validFrom: 1, validTo: 1 });
