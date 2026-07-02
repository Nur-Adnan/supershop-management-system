import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode } from "@supershop/shared";
import type { Model } from "mongoose";
import type { Principal } from "../auth/principal";
import { DomainException } from "../common/domain.exception";
import { persist, throwConflictOnDuplicate } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { MoneyEmbed } from "../common/schema/money.schema";
import { StoresRepository } from "../stores/store.repository";
import { CashSessionRepository } from "./cash-session.repository";
import type { CashSession } from "./cash-session.schema";
import { CashTransaction } from "./cash-transaction.schema";
import { CashTransactionRepository } from "./cash-transaction.repository";

export interface OpenCashSessionInput {
  storeId: string;
  terminalId: string;
  openingFloat: MoneyEmbed;
}
export interface CloseCashSessionInput {
  closingCount: MoneyEmbed;
}
export interface CashInOutInput {
  amount: MoneyEmbed;
  reason: string;
}

const INFLOW_TYPES = new Set(["SALE", "PAYIN"]);

@Injectable()
export class CashSessionsService {
  constructor(
    private readonly sessions: CashSessionRepository,
    private readonly transactions: CashTransactionRepository,
    @InjectModel(CashTransaction.name) private readonly txModel: Model<CashTransaction>,
    private readonly stores: StoresRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.sessions.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<CashSession> {
    const session = await this.sessions.findById(id);
    if (!session) throw new DomainException(ErrorCode.NOT_FOUND, "Cash session not found", 404);
    return session;
  }

  async open(input: OpenCashSessionInput, actor?: Principal): Promise<CashSession> {
    if (!(await this.stores.findById(input.storeId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
    try {
      return await this.sessions.create(
        persist<CashSession>({
          storeId: input.storeId,
          terminalId: input.terminalId,
          openedBy: actor?.userId,
          openingFloat: input.openingFloat,
          status: "OPEN",
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
      );
    } catch (err) {
      throwConflictOnDuplicate(err, "A session is already open for this terminal");
    }
  }

  async close(id: string, input: CloseCashSessionInput, actor?: Principal): Promise<CashSession> {
    const session = await this.getOrThrow(id);
    if (session.status !== "OPEN") {
      throw new DomainException(ErrorCode.CONFLICT, "This cash session is already closed", 409);
    }
    const entries = await this.txModel.find({ sessionId: id }).lean();
    const net = entries.reduce(
      (sum, e) => sum + (INFLOW_TYPES.has(e.type) ? e.amount.amount : -e.amount.amount),
      0,
    );
    const expectedAmount = session.openingFloat.amount + net;
    const updated = await this.sessions.updateById(id, {
      $set: {
        closingCount: input.closingCount,
        expectedCash: { amount: expectedAmount, currency: session.openingFloat.currency },
        variance: {
          amount: input.closingCount.amount - expectedAmount,
          currency: session.openingFloat.currency,
        },
        status: "CLOSED",
        closedBy: actor?.userId,
        closedAt: new Date(),
        updatedBy: actor?.userId,
      },
    });
    if (!updated) throw new DomainException(ErrorCode.NOT_FOUND, "Cash session not found", 404);
    return updated;
  }

  async payIn(id: string, input: CashInOutInput, actor?: Principal): Promise<CashSession> {
    await this.assertOpen(id);
    await this.transactions.create(
      persist<CashTransaction>({
        sessionId: id,
        type: "PAYIN",
        amount: input.amount,
        reason: input.reason,
        createdBy: actor?.userId,
        updatedBy: actor?.userId,
      }),
    );
    return this.getOrThrow(id);
  }

  async payOut(id: string, input: CashInOutInput, actor?: Principal): Promise<CashSession> {
    await this.assertOpen(id);
    await this.transactions.create(
      persist<CashTransaction>({
        sessionId: id,
        type: "PAYOUT",
        amount: input.amount,
        reason: input.reason,
        createdBy: actor?.userId,
        updatedBy: actor?.userId,
      }),
    );
    return this.getOrThrow(id);
  }

  private async assertOpen(id: string): Promise<void> {
    const session = await this.getOrThrow(id);
    if (session.status !== "OPEN") {
      throw new DomainException(ErrorCode.CONFLICT, "This cash session is not open", 409);
    }
  }
}
