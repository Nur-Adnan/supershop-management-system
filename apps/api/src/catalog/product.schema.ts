import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

@Schema({ _id: false })
export class ProductPricing {
  @Prop({ type: MoneyEmbedSchema, required: true })
  costPrice!: MoneyEmbed;

  @Prop({ type: MoneyEmbedSchema, required: true })
  sellPrice!: MoneyEmbed;

  /** Maximum retail price (optional ceiling). */
  @Prop({ type: MoneyEmbedSchema })
  mrp?: MoneyEmbed;
}
const ProductPricingSchema = SchemaFactory.createForClass(ProductPricing);

@Schema({ collection: "products" })
export class Product {
  @Prop({ required: true, unique: true })
  sku!: string;

  @Prop({ type: [String], default: [] })
  barcodes!: string[];

  @Prop({ required: true })
  name!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Category", required: true })
  categoryId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Brand" })
  brandId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Unit", required: true })
  unitId!: Types.ObjectId;

  @Prop({ type: ProductPricingSchema, required: true })
  pricing!: ProductPricing;

  /** VAT rate in basis points (1% = 100 bps). */
  @Prop({ default: 0 })
  taxRateBps!: number;

  /** Sold by weight — must reference a unit with allowDecimal: true. */
  @Prop({ default: false })
  isWeighted!: boolean;

  @Prop({ default: 0 })
  reorderLevel!: number;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ default: true })
  isActive!: boolean;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = applyBaseSchema(SchemaFactory.createForClass(Product), {
  softDelete: true,
});

// Full-text search on name; category filter.
ProductSchema.index({ name: "text" }, { name: "products_name_text" });
ProductSchema.index({ categoryId: 1, isActive: 1 });
// Unique across every barcode of every product. Partial on `barcodes.0` so products with no
// barcodes (empty array) don't collide (a plain unique+sparse multikey index would — verified).
ProductSchema.index(
  { barcodes: 1 },
  { unique: true, partialFilterExpression: { "barcodes.0": { $exists: true } } },
);
