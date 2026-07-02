import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type ClientSession, type Model, Types } from "mongoose";
import { AuditLog, type AuditLogDocument } from "./audit-log.schema";
import { diffObjects } from "./diff";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  actorEmail?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>) {}

  /**
   * Append an immutable audit record. Pass a `session` to write it inside the same
   * transaction as the mutation it records — so it commits or rolls back atomically.
   */
  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    const changes =
      entry.before || entry.after ? diffObjects(entry.before ?? {}, entry.after ?? {}) : undefined;

    await this.model.create(
      [
        {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          actorId: entry.actorId ? new Types.ObjectId(entry.actorId) : undefined,
          actorEmail: entry.actorEmail,
          before: entry.before,
          after: entry.after,
          changes,
          ip: entry.ip,
          at: new Date(),
        },
      ],
      { session },
    );
  }
}
