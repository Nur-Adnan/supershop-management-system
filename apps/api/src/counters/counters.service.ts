import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Model } from "mongoose";
import { isDuplicateKeyError } from "../common/mongo.util";
import { Counter, type CounterDocument } from "./counter.schema";

/** Format a sequence as a prefixed business number, e.g. INV-2026-000123. */
export function formatSequence(
  prefix: string,
  seq: number,
  opts: { year?: number; width?: number } = {},
): string {
  const width = opts.width ?? 6;
  const padded = String(seq).padStart(width, "0");
  return opts.year ? `${prefix}-${opts.year}-${padded}` : `${prefix}-${padded}`;
}

@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private readonly model: Model<CounterDocument>) {}

  /**
   * Atomically returns the next value for a named counter. `$inc` on a single
   * document is collision-free even under heavy concurrency; the only race is the
   * very first upsert, which we retry on duplicate-key (when not in a transaction —
   * inside one, the duplicate aborts the txn, so seed hot counters via migration).
   */
  async next(name: string, session?: ClientSession): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await this.model
          .findOneAndUpdate(
            { name },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: "after", session },
          )
          .lean();
        return doc!.seq;
      } catch (err) {
        if (isDuplicateKeyError(err) && !session && attempt < 3) continue;
        throw err;
      }
    }
  }

  async nextFormatted(
    name: string,
    prefix: string,
    opts: { year?: number; width?: number; session?: ClientSession } = {},
  ): Promise<string> {
    const seq = await this.next(name, opts.session);
    return formatSequence(prefix, seq, opts);
  }
}
