import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode } from "@supershop/shared";
import type { Model } from "mongoose";
import { DomainException } from "../common/domain.exception";
import { BaseRepository, type WithId } from "../common/repository/base.repository";
import { Account } from "./account.schema";

@Injectable()
export class AccountRepository extends BaseRepository<Account> {
  constructor(@InjectModel(Account.name) model: Model<Account>) {
    super(model);
  }
}

/**
 * Resolve a well-known system account by code (see system-accounts.ts), for callers that post
 * automatic journal entries (checkout/GRN/refund/expense). 503, not 404: a missing system account
 * means the chart of accounts failed to seed on boot — an infra problem, not a client error.
 */
export async function requireAccountByCode(
  accounts: AccountRepository,
  code: string,
): Promise<WithId<Account>> {
  const account = await accounts.findOne({ code });
  if (!account) {
    throw new DomainException(
      ErrorCode.SERVICE_UNAVAILABLE,
      `System account ${code} is not seeded`,
      503,
    );
  }
  return account;
}
