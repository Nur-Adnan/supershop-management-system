import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { type Aggregate, type HydratedDocument, SchemaTypes, type Types } from "mongoose";

@Schema({ collection: "audit_logs" })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: "User" })
  actorId?: Types.ObjectId;

  @Prop()
  actorEmail?: string;

  /** Dotted action key, e.g. "user.role.assign". */
  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop()
  entityId?: string;

  @Prop({ type: SchemaTypes.Mixed })
  before?: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  after?: unknown;

  @Prop({ type: SchemaTypes.Mixed })
  changes?: unknown;

  @Prop()
  ip?: string;

  @Prop({ required: true })
  at!: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Append-only: reject every update/delete/replace query at the schema layer (defense in
// depth). A regex hook matches all such query-middleware names without touching reads.
function blockMutation(next?: (err?: Error) => void): void {
  const err = new Error("audit_logs is append-only and immutable");
  if (typeof next === "function") {
    next(err);
    return;
  }
  throw err;
}
AuditLogSchema.pre(/^(update|replace|delete|findOneAnd)/, blockMutation);
// Block aggregate pipelines that could rewrite the collection ($out / $merge into audit_logs).
AuditLogSchema.pre<Aggregate<unknown>>("aggregate", function (next) {
  const stages = this.pipeline() as unknown as Array<Record<string, unknown>>;
  if (stages.some((stage) => "$out" in stage || "$merge" in stage)) {
    throw new Error("audit_logs is append-only and immutable");
  }
  if (typeof next === "function") next();
});
// NOTE: Model.bulkWrite() and native-driver writes are not hookable in Mongoose and bypass the
// guards above. The AuditLog model is intentionally NOT exported (AuditModule exposes only
// AuditService.record), so tampering requires deliberate internal code. Enforce true immutability
// at the DB layer in production (a restricted write role / collection controls on audit_logs).

AuditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });
