import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { ClientSession, Connection } from "mongoose";

type TransactionOptions = Parameters<ClientSession["withTransaction"]>[1];

/**
 * Runs `fn` inside a MongoDB multi-document transaction. The driver auto-retries
 * on transient/commit errors. Every repository method that mutates money or stock
 * must accept the passed `session` so all writes commit or roll back together.
 */
@Injectable()
export class TransactionService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async withTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await fn(session);
      }, options);
      return result;
    } finally {
      await session.endSession();
    }
  }
}
