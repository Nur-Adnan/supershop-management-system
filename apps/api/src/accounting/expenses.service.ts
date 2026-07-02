import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import { Types } from "mongoose";
import type { Principal } from "../auth/principal";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { MoneyEmbed } from "../common/schema/money.schema";
import { TransactionService } from "../database/transaction.service";
import { StoresRepository } from "../stores/store.repository";
import { AccountRepository, requireAccountByCode } from "./account.repository";
import { expenseSettlementAccountForMethod } from "./system-accounts";
import { ExpenseRepository } from "./expense.repository";
import type { Expense } from "./expense.schema";
import { JournalService } from "./journal.service";

export interface CreateExpenseInput {
  accountId: string;
  amount: MoneyEmbed;
  storeId?: string;
  paidVia: string;
  description: string;
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly txn: TransactionService,
    private readonly journal: JournalService,
    private readonly expenses: ExpenseRepository,
    private readonly accounts: AccountRepository,
    private readonly stores: StoresRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.expenses.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<Expense> {
    const expense = await this.expenses.findById(id);
    if (!expense) throw new DomainException(ErrorCode.NOT_FOUND, "Expense not found", 404);
    return expense;
  }

  /** Records an expense and posts its journal entry (Dr the expense account, Cr the settling
   * cash/AR account for paidVia) atomically — Hard Rule 2, same as every other money-creating
   * action in this system. */
  async create(input: CreateExpenseInput, actor?: Principal): Promise<Expense> {
    const account = await this.accounts.findById(input.accountId);
    if (!account) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Account does not exist", 400);
    }
    if (account.type !== "EXPENSE") {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "accountId must reference an EXPENSE-type account",
        400,
      );
    }
    if (!account.isActive) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "accountId references a deactivated account",
        400,
      );
    }
    if (input.storeId && !(await this.stores.findById(input.storeId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
    const cashAccount = await requireAccountByCode(
      this.accounts,
      expenseSettlementAccountForMethod(input.paidVia),
    );

    return this.txn.withTransaction(async (session) => {
      const expenseId = new Types.ObjectId();
      const journalId = new Types.ObjectId();

      await this.journal.postEntry(
        {
          id: String(journalId),
          lines: [
            { accountId: input.accountId, debit: input.amount.amount, credit: 0 },
            { accountId: cashAccount.id, debit: 0, credit: input.amount.amount },
          ],
          currency: input.amount.currency,
          refType: "expense",
          refId: String(expenseId),
          description: input.description,
        },
        session,
        actor,
      );

      return this.expenses.create(
        persist<Expense>({
          _id: expenseId,
          accountId: input.accountId,
          amount: input.amount,
          storeId: input.storeId,
          paidVia: input.paidVia,
          description: input.description,
          journalEntryId: journalId,
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
    });
  }
}
