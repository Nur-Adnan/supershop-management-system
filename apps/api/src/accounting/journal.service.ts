import { Injectable } from "@nestjs/common";
import { ErrorCode, type Currency } from "@supershop/shared";
import type { ClientSession } from "mongoose";
import type { Principal } from "../auth/principal";
import { AccountRepository } from "./account.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { assertBalancedEntry, reverseLines, type JournalLineInput } from "./journal-invariants";
import type { JournalEntry } from "./journal-entry.schema";
import { JournalEntryRepository } from "./journal-entry.repository";

export interface CreateJournalEntryInput {
  lines: JournalLineInput[];
  currency: Currency;
  refType?: string;
  refId?: string;
  description?: string;
  date?: Date;
}

export interface PostEntryInput {
  /** Pre-generated id, so a caller can reference this entry (e.g. ExpensesService.journalEntryId)
   * before it exists — avoids reading an id back off a just-created document. */
  id?: string;
  lines: JournalLineInput[];
  currency: Currency;
  refType?: string;
  refId?: string;
  description?: string;
  date?: Date;
  reversalOfId?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    private readonly entries: JournalEntryRepository,
    private readonly accounts: AccountRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.entries.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<JournalEntry> {
    const entry = await this.entries.findById(id);
    if (!entry) throw new DomainException(ErrorCode.NOT_FOUND, "Journal entry not found", 404);
    return entry;
  }

  /**
   * Validates the double-entry balance invariant and appends the entry. Always pass a `session`
   * from an active transaction — this is designed to be called from inside a caller's own
   * withTransaction (checkout/GRN/refund/expense), mirroring StockService's
   * postReceiptLine/postOutboundLine, so the ledger posting commits or rolls back with the
   * business action it records.
   */
  async postEntry(
    input: PostEntryInput,
    session: ClientSession,
    actor?: Principal,
  ): Promise<JournalEntry> {
    assertBalancedEntry(input.lines);
    const number = await this.counters.nextFormatted("journal_entry", "JE", {
      year: new Date().getFullYear(),
      session,
    });
    return this.entries.create(
      persist<JournalEntry>({
        _id: input.id,
        number,
        date: input.date ?? new Date(),
        lines: input.lines,
        currency: input.currency,
        refType: input.refType,
        refId: input.refId,
        description: input.description,
        reversalOfId: input.reversalOfId,
        createdBy: actor?.userId,
        updatedBy: actor?.userId,
      }),
      { session },
    );
  }

  /**
   * The manual-entry HTTP endpoint's entry point: validates every accountId exists (postEntry
   * itself doesn't — its other callers, checkout/GRN/expense, already resolved their own accounts)
   * and opens its own transaction, mirroring how StockService.receive() wraps postReceiptLine.
   */
  async createManual(input: CreateJournalEntryInput, actor?: Principal): Promise<JournalEntry> {
    for (const line of input.lines) {
      const account = await this.accounts.findById(line.accountId);
      if (!account) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Account ${line.accountId} does not exist`,
          400,
        );
      }
      if (!account.isActive) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Account ${line.accountId} is deactivated and cannot receive postings`,
          400,
        );
      }
    }
    return this.txn.withTransaction((session) => this.postEntry(input, session, actor));
  }

  /**
   * Posts an equal-and-opposite entry reversing `id` — the correction mechanism for an immutable
   * ledger (never edit a posted entry). A standalone action with its own transaction, not composed
   * into a caller's — unlike postEntry, which is always called from inside one.
   */
  async reverse(id: string, actor?: Principal): Promise<JournalEntry> {
    return this.txn.withTransaction(async (session) => {
      const original = await this.entries.findById(id, { session });
      if (!original) throw new DomainException(ErrorCode.NOT_FOUND, "Journal entry not found", 404);
      return this.postEntry(
        {
          lines: reverseLines(
            original.lines.map((l) => ({
              accountId: String(l.accountId),
              debit: l.debit,
              credit: l.credit,
            })),
          ),
          currency: original.currency,
          refType: "journal_reversal",
          refId: original.number,
          description: `Reversal of ${original.number}`,
          reversalOfId: id,
        },
        session,
        actor,
      );
    });
  }
}
