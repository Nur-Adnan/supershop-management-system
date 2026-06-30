import { Schema } from "mongoose";

/**
 * Audit/soft-delete fields every domain collection carries (Hard Rule 8).
 * `createdAt`/`updatedAt` come from Mongoose `timestamps`.
 */
export interface BaseDocumentFields {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: unknown;
  updatedBy?: unknown;
  deletedAt?: Date | null;
  deletedBy?: unknown;
}

/** Shared toJSON transform: `_id` -> `id`, drop `__v`. Exported for unit testing. */
export function idTransform(_doc: unknown, ret: Record<string, unknown>): Record<string, unknown> {
  if (ret._id !== undefined) {
    ret.id = ret._id;
    delete ret._id;
  }
  delete ret.__v;
  return ret;
}

/**
 * Apply Supershop conventions to a Mongoose schema: timestamps, createdBy/updatedBy,
 * optional soft-delete, and the id transform. Call on every domain schema.
 */
export function applyBaseSchema(schema: Schema, opts: { softDelete?: boolean } = {}): Schema {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
  });

  if (opts.softDelete) {
    schema.add({
      deletedAt: { type: Date, default: null },
      deletedBy: { type: Schema.Types.ObjectId, ref: "User", required: false },
    });
    schema.index({ deletedAt: 1 });
  }

  schema.set("timestamps", true);
  schema.set("toJSON", { virtuals: true, versionKey: false, transform: idTransform });
  schema.set("toObject", { virtuals: true, versionKey: false, transform: idTransform });
  return schema;
}
