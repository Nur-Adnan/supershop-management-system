import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { PaymentMethod } from "@supershop/shared";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

export type SaleStatus = "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";

@Schema({ _id: false })
export class SaleLine {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Product", required: true })
  productId!: Types.ObjectId;

  /** Denormalized at sale time so the invoice reads correctly even if the product changes later. */
  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  qty!: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  unitPrice!: MoneyEmbed;

  /** VAT rate in basis points, captured from the product at sale time. */
  @Prop({ required: true, default: 0 })
  taxBps!: number;

  /** qty * unitPrice, before tax. Stored separately from lineTax so a partial refund can reverse
   * revenue and tax payable independently (see SaleReturnsService). */
  @Prop({ type: MoneyEmbedSchema, required: true })
  lineSubtotal!: MoneyEmbed;

  @Prop({ type: MoneyEmbedSchema, required: true })
  lineTax!: MoneyEmbed;

  @Prop({ type: MoneyEmbedSchema, required: true })
  lineTotal!: MoneyEmbed;

  /** Cumulative quantity returned against this line via sale_returns. */
  @Prop({ required: true, default: 0 })
  refundedQty!: number;
}
const SaleLineSchema = SchemaFactory.createForClass(SaleLine);

@Schema({ _id: false })
export class SalePaymentSnapshot {
  @Prop({ type: String, required: true, enum: Object.values(PaymentMethod) })
  method!: PaymentMethod;

  @Prop({ type: MoneyEmbedSchema, required: true })
  amount!: MoneyEmbed;
}
const SalePaymentSnapshotSchema = SchemaFactory.createForClass(SalePaymentSnapshot);

/** POS invoice. Never edited after creation except status/refundedQty, both advanced only by
 * posting a sale_return — mirrors how a PurchaseOrder's status/receivedQty advance via GRNs. */
@Schema({ collection: "sales" })
export class Sale {
  @Prop({ required: true, unique: true })
  number!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "Customer" })
  customerId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: "CashSession", required: true })
  cashSessionId!: Types.ObjectId;

  @Prop({ type: [SaleLineSchema], default: [] })
  lines!: SaleLine[];

  @Prop({ type: MoneyEmbedSchema, required: true })
  subtotal!: MoneyEmbed;

  @Prop({ type: MoneyEmbedSchema, required: true })
  taxTotal!: MoneyEmbed;

  @Prop({ type: MoneyEmbedSchema, required: true })
  discountTotal!: MoneyEmbed;

  /** Denormalized from the applied Promotion at sale time (see PromotionsService). Absent when
   * no code was used. */
  @Prop()
  promotionCode?: string;

  @Prop({ type: MoneyEmbedSchema })
  promotionDiscount?: MoneyEmbed;

  /** Loyalty points redeemed against this sale, and their money value at redemption time. */
  @Prop()
  pointsRedeemed?: number;

  @Prop({ type: MoneyEmbedSchema })
  redemptionDiscount?: MoneyEmbed;

  /** Points awarded to the customer from this sale (see LoyaltyService.earn). */
  @Prop()
  pointsEarned?: number;

  @Prop({ type: MoneyEmbedSchema, required: true })
  total!: MoneyEmbed;

  @Prop({ type: [SalePaymentSnapshotSchema], default: [] })
  payments!: SalePaymentSnapshot[];

  @Prop({
    type: String,
    required: true,
    enum: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"],
    default: "COMPLETED",
  })
  status!: SaleStatus;
}

export type SaleDocument = HydratedDocument<Sale>;
export const SaleSchema = applyBaseSchema(SchemaFactory.createForClass(Sale));
SaleSchema.index({ storeId: 1, createdAt: -1 });
SaleSchema.index({ customerId: 1, createdAt: -1 });
