import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Model } from "mongoose";
import { isDuplicateKeyError } from "../common/mongo.util";
import { IdempotencyKey, type IdempotencyKeyDocument } from "./idempotency-key.schema";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface ReserveParams {
  key: string;
  endpoint: string;
  method: string;
  requestHash?: string;
}

export type ReserveResult = { replay: false } | { replay: true; record: IdempotencyKey };

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyKey.name) private readonly model: Model<IdempotencyKeyDocument>,
  ) {}

  /**
   * Claim the key. Returns `{ replay: false }` for a fresh request, or the stored
   * record to replay/conflict-check when the key already exists.
   */
  async reserve(params: ReserveParams, session?: ClientSession): Promise<ReserveResult> {
    try {
      await this.model.create(
        [{ ...params, state: "IN_PROGRESS", expiresAt: new Date(Date.now() + TTL_MS) }],
        {
          session,
        },
      );
      return { replay: false };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const record = await this.model.findOne({ key: params.key }).lean();
      return { replay: true, record: record as IdempotencyKey };
    }
  }

  /** Persist the final result so future replays return it. Pass a session to make this atomic with the business writes. */
  async complete(key: string, result: unknown, session?: ClientSession): Promise<void> {
    await this.model.updateOne({ key }, { $set: { state: "COMPLETED", result } }, { session });
  }

  /** Drop the reservation so the client may retry (used when the handler errored). */
  async release(key: string, session?: ClientSession): Promise<void> {
    await this.model.deleteOne({ key }, { session });
  }
}
