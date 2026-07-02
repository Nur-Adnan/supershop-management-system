import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type Currency, SUPPORTED_CURRENCIES } from "@supershop/shared";

/** Embedded money value — integer minor units + currency (Hard Rule 7). Reused across schemas. */
@Schema({ _id: false })
export class MoneyEmbed {
  @Prop({ required: true })
  amount!: number;

  @Prop({ type: String, required: true, enum: [...SUPPORTED_CURRENCIES] })
  currency!: Currency;
}
export const MoneyEmbedSchema = SchemaFactory.createForClass(MoneyEmbed);
