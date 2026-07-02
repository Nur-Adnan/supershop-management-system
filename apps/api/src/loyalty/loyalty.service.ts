import { Injectable } from "@nestjs/common";
import { ErrorCode, LoyaltyTransactionType } from "@supershop/shared";
import type { ClientSession } from "mongoose";
import type { Principal } from "../auth/principal";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { CustomersRepository } from "../customers/customer.repository";
import { assertSufficientPoints } from "./loyalty-invariants";
import { LoyaltyTransaction } from "./loyalty-transaction.schema";
import { LoyaltyTransactionRepository } from "./loyalty-transaction.repository";

export interface LoyaltyLedgerInput {
  session: ClientSession;
  customerId: string;
  points: number;
  refType: string;
  refId: string;
  actor?: Principal;
}

/**
 * Session-composable primitives (earn/redeem) — always called from inside a caller's own
 * transaction (checkout), mirroring StockService.postReceiptLine/postOutboundLine and
 * JournalService.postEntry. `customer.loyaltyPoints` is the denormalized running balance, kept in
 * sync with the loyalty_transactions ledger in the SAME transaction as each entry.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly transactions: LoyaltyTransactionRepository,
    private readonly customers: CustomersRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.transactions.paginate(query, baseFilter);
  }

  async earn(input: LoyaltyLedgerInput): Promise<void> {
    if (input.points <= 0) return;
    await this.transactions.create(
      persist<LoyaltyTransaction>({
        customerId: input.customerId,
        type: LoyaltyTransactionType.EARN,
        points: input.points,
        refType: input.refType,
        refId: input.refId,
        createdBy: input.actor?.userId,
        updatedBy: input.actor?.userId,
      }),
      { session: input.session },
    );
    await this.customers.updateById(
      input.customerId,
      { $inc: { loyaltyPoints: input.points } },
      { session: input.session },
    );
  }

  async redeem(input: LoyaltyLedgerInput): Promise<void> {
    if (input.points <= 0) return;
    const customer = await this.customers.findOne(
      { _id: input.customerId },
      { session: input.session },
    );
    if (!customer) throw new DomainException(ErrorCode.NOT_FOUND, "Customer not found", 404);
    assertSufficientPoints(customer.loyaltyPoints, input.points);

    await this.transactions.create(
      persist<LoyaltyTransaction>({
        customerId: input.customerId,
        type: LoyaltyTransactionType.REDEEM,
        points: input.points,
        refType: input.refType,
        refId: input.refId,
        createdBy: input.actor?.userId,
        updatedBy: input.actor?.userId,
      }),
      { session: input.session },
    );
    await this.customers.updateById(
      input.customerId,
      { $inc: { loyaltyPoints: -input.points } },
      { session: input.session },
    );
  }
}
