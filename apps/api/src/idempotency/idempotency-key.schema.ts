import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type HydratedDocument, SchemaTypes } from "mongoose";

export type IdempotencyState = "IN_PROGRESS" | "COMPLETED";

@Schema({ collection: "idempotency_keys" })
export class IdempotencyKey {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ required: true })
  endpoint!: string;

  @Prop({ required: true })
  method!: string;

  /** Hash of method+url+body — guards against reusing a key with a different payload. */
  @Prop()
  requestHash?: string;

  @Prop({ required: true, enum: ["IN_PROGRESS", "COMPLETED"], default: "IN_PROGRESS" })
  state!: IdempotencyState;

  @Prop({ type: SchemaTypes.Mixed })
  result?: unknown;

  /** TTL anchor — Mongo expires the document at this time. */
  @Prop({ required: true })
  expiresAt!: Date;
}

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKey>;
export const IdempotencyKeySchema = SchemaFactory.createForClass(IdempotencyKey);
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
