import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes, type Types } from "mongoose";
import { applyBaseSchema } from "../common/base.schema";
import { MoneyEmbed, MoneyEmbedSchema } from "../common/schema/money.schema";

export type CashSessionStatus = "OPEN" | "CLOSED";

/** A register shift: open with a starting float, close with a physical cash count. */
@Schema({ collection: "cash_sessions" })
export class CashSession {
  @Prop({ type: SchemaTypes.ObjectId, ref: "Store", required: true })
  storeId!: Types.ObjectId;

  @Prop({ required: true })
  terminalId!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User", required: true })
  openedBy!: Types.ObjectId;

  @Prop({ type: MoneyEmbedSchema, required: true })
  openingFloat!: MoneyEmbed;

  /** Physically counted cash at close. */
  @Prop({ type: MoneyEmbedSchema })
  closingCount?: MoneyEmbed;

  /** openingFloat + Σcash_transactions for this session, computed at close. */
  @Prop({ type: MoneyEmbedSchema })
  expectedCash?: MoneyEmbed;

  /** closingCount - expectedCash. Positive = over, negative = short. */
  @Prop({ type: MoneyEmbedSchema })
  variance?: MoneyEmbed;

  @Prop({ type: String, required: true, enum: ["OPEN", "CLOSED"], default: "OPEN" })
  status!: CashSessionStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: "User" })
  closedBy?: Types.ObjectId;

  @Prop({ type: Date })
  closedAt?: Date;
}

export type CashSessionDocument = HydratedDocument<CashSession>;
export const CashSessionSchema = applyBaseSchema(SchemaFactory.createForClass(CashSession));
// At most one OPEN session per terminal at a time.
CashSessionSchema.index(
  { storeId: 1, terminalId: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } },
);
CashSessionSchema.index({ storeId: 1, createdAt: -1 });
