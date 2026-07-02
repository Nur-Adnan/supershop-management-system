import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

export interface JournalLineInput {
  accountId: string;
  /** Integer minor units. Exactly one of debit/credit must be > 0 on a given line. */
  debit: number;
  credit: number;
}

/** A line is a pure debit XOR a pure credit — never both, never neither. */
function assertValidLine(line: JournalLineInput): void {
  if (!Number.isInteger(line.debit) || !Number.isInteger(line.credit)) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "debit and credit must be integer minor units",
      400,
    );
  }
  if (line.debit < 0 || line.credit < 0) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "debit and credit cannot be negative",
      400,
    );
  }
  const hasDebit = line.debit > 0;
  const hasCredit = line.credit > 0;
  if (hasDebit === hasCredit) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "Each journal line must have exactly one of debit or credit greater than zero",
      400,
    );
  }
}

/**
 * The fundamental double-entry invariant: total debits must equal total credits (Hard Rule-
 * adjacent — every money-moving action in this system must be provably balanced). Throws on
 * the first violation found. Pure — unit-tested directly.
 */
export function assertBalancedEntry(lines: JournalLineInput[]): void {
  if (lines.length < 2) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "A journal entry needs at least two lines",
      400,
    );
  }
  for (const line of lines) assertValidLine(line);
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      `Journal entry does not balance: debits ${totalDebit} != credits ${totalCredit}`,
      400,
    );
  }
}

/** Swap debit/credit on every line — the standard correction mechanism for an immutable ledger. */
export function reverseLines(lines: JournalLineInput[]): JournalLineInput[] {
  return lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit }));
}
