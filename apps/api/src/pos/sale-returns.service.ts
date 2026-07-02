import { Injectable } from "@nestjs/common";
import { ErrorCode, multiplyMoney, StockMovementType, type Currency } from "@supershop/shared";
import type { ClientSession, UpdateQuery } from "mongoose";
import type { Principal } from "../auth/principal";
import { AccountRepository, requireAccountByCode } from "../accounting/account.repository";
import type { JournalLineInput } from "../accounting/journal-invariants";
import { JournalService } from "../accounting/journal.service";
import { cashAccountForMethod, SYSTEM_ACCOUNTS } from "../accounting/system-accounts";
import { ProductsRepository } from "../catalog/product.repository";
import { CustomersRepository } from "../customers/customer.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { StockService } from "../inventory/stock.service";
import { CashSessionRepository } from "./cash-session.repository";
import { CashTransaction } from "./cash-transaction.schema";
import { CashTransactionRepository } from "./cash-transaction.repository";
import { Payment } from "./payment.schema";
import { PaymentRepository } from "./payment.repository";
import { computeSaleStatus, proportionalRefundAmount } from "./sale-invariants";
import { SaleReturn } from "./sale-return.schema";
import { SaleReturnRepository } from "./sale-return.repository";
import type { Sale } from "./sale.schema";
import { SaleRepository } from "./sale.repository";

export interface RefundInput {
  saleId: string;
  cashSessionId: string;
  refundMethod: string;
  reason: string;
  lines: Array<{ productId: string; qty: number }>;
}

@Injectable()
export class SaleReturnsService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    private readonly stock: StockService,
    private readonly products: ProductsRepository,
    private readonly customers: CustomersRepository,
    private readonly cashSessions: CashSessionRepository,
    private readonly sales: SaleRepository,
    private readonly returns: SaleReturnRepository,
    private readonly payments: PaymentRepository,
    private readonly cashTransactions: CashTransactionRepository,
    private readonly journal: JournalService,
    private readonly accounts: AccountRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.returns.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<SaleReturn> {
    const ret = await this.returns.findById(id);
    if (!ret) throw new DomainException(ErrorCode.NOT_FOUND, "Sale return not found", 404);
    return ret;
  }

  /**
   * Refunds part or all of a sale: validates each line against the sale's remaining
   * (unrefunded) quantity, restocks it (a new batch, at the product's current cost — the
   * original FEFO lot is gone), refunds the money (a cash-drawer entry for CASH, a credit-limit
   * balance reversal for CREDIT), and advances the sale's per-line refundedQty/status — all in
   * ONE transaction, mirroring how a GRN advances a purchase order's receivedQty/status.
   */
  async refund(dto: RefundInput, actor?: Principal): Promise<SaleReturn> {
    const cashSession = await this.cashSessions.findById(dto.cashSessionId);
    if (!cashSession) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Cash session does not exist", 400);
    }
    if (cashSession.status !== "OPEN") {
      throw new DomainException(ErrorCode.CONFLICT, "Cash session is not open", 409);
    }

    return this.txn.withTransaction(async (session) => {
      const sale = await this.findSaleForUpdate(dto.saleId, session);
      if (String(cashSession.storeId) !== String(sale.storeId)) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Cash session does not belong to this sale's store",
          400,
        );
      }
      if (sale.status === "REFUNDED") {
        throw new DomainException(
          ErrorCode.CONFLICT,
          "This sale has already been fully refunded",
          409,
        );
      }

      const byProduct = new Map(sale.lines.map((l) => [String(l.productId), l]));
      const updatedRefunded = new Map<string, number>();
      const number = await this.counters.nextFormatted("sale_return", "RTN", {
        year: new Date().getFullYear(),
        session,
      });

      const postedLines = [];
      let totalAmount = 0;
      let totalRefundSubtotal = 0;
      let totalRefundTax = 0;
      let totalRestockValue = 0;
      let currency: Currency = "BDT";
      for (const line of dto.lines) {
        const saleLine = byProduct.get(line.productId);
        if (!saleLine) {
          throw new DomainException(
            ErrorCode.VALIDATION_ERROR,
            `Product ${line.productId} is not on this sale`,
            400,
          );
        }
        const remaining = saleLine.qty - saleLine.refundedQty;
        if (line.qty > remaining) {
          throw new DomainException(
            ErrorCode.CONFLICT,
            `Over-refund: ${line.qty} exceeds the remaining ${remaining} for this product`,
            409,
          );
        }
        // Reverse revenue and tax independently (not the combined lineTotal) so the journal can
        // credit Sales Revenue and Tax Payable separately; refundAmount is their exact sum, not a
        // third independent rounding, so the payment always matches the journal's credit leg.
        const refundSubtotal = proportionalRefundAmount(
          saleLine.lineSubtotal.amount,
          saleLine.qty,
          line.qty,
        );
        const refundTax = proportionalRefundAmount(saleLine.lineTax.amount, saleLine.qty, line.qty);
        const refundAmount = refundSubtotal + refundTax;
        currency = saleLine.lineTotal.currency;
        totalAmount += refundAmount;
        totalRefundSubtotal += refundSubtotal;
        totalRefundTax += refundTax;

        const product = await this.products.findById(line.productId);
        if (!product) {
          throw new DomainException(
            ErrorCode.VALIDATION_ERROR,
            `Product ${line.productId} does not exist`,
            400,
          );
        }
        if (product.pricing.costPrice.currency !== currency) {
          throw new DomainException(
            ErrorCode.VALIDATION_ERROR,
            `Product ${line.productId}'s cost currency does not match the sale currency`,
            400,
          );
        }
        totalRestockValue += multiplyMoney(product.pricing.costPrice, line.qty).amount;
        await this.stock.postReceiptLine({
          session,
          storeId: String(sale.storeId),
          productId: line.productId,
          qty: line.qty,
          costPrice: product.pricing.costPrice,
          type: StockMovementType.RETURN,
          refType: "sale_return",
          refId: number,
          actor,
        });
        updatedRefunded.set(line.productId, saleLine.refundedQty + line.qty);
        postedLines.push({
          productId: line.productId,
          qty: line.qty,
          refundAmount: { amount: refundAmount, currency },
        });
      }

      const newLines = sale.lines.map((l) => ({
        ...l,
        refundedQty: updatedRefunded.get(String(l.productId)) ?? l.refundedQty,
      }));
      await this.sales.updateById(
        dto.saleId,
        persist<UpdateQuery<Sale>>({
          $set: { lines: newLines, status: computeSaleStatus(newLines), updatedBy: actor?.userId },
        }),
        { session },
      );

      const total = { amount: totalAmount, currency };
      await this.payments.create(
        persist<Payment>({
          direction: "OUT",
          method: dto.refundMethod,
          refType: "sale_return",
          refId: number,
          amount: total,
          storeId: sale.storeId,
          customerId: sale.customerId,
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
      if (dto.refundMethod === "CASH") {
        await this.cashTransactions.create(
          persist<CashTransaction>({
            sessionId: dto.cashSessionId,
            type: "REFUND",
            amount: total,
            refType: "sale_return",
            refId: number,
            createdBy: actor?.userId,
            updatedBy: actor?.userId,
          }),
          { session },
        );
      } else if (dto.refundMethod === "CREDIT" && sale.customerId) {
        await this.customers.updateById(
          String(sale.customerId),
          { $inc: { "openingBalance.amount": -totalAmount } },
          { session },
        );
      }

      // Reversing entry for the whole refund, atomic with everything above:
      //   Dr Sales Revenue   = Σ refundSubtotal (only if > 0)
      //   Dr Tax Payable     = Σ refundTax (only if > 0)
      //   Cr [Cash/AR]       = totalAmount (= refundSubtotal + refundTax, present iff either is)
      //   Dr Inventory / Cr Cost of Goods Sold = totalRestockValue (only if > 0)
      // Each side always sums equal by construction — see the retrofit note in SalesService.
      const journalLines: JournalLineInput[] = [];
      if (totalRefundSubtotal > 0) {
        const revenueAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.SALES_REVENUE,
        );
        journalLines.push({ accountId: revenueAccount.id, debit: totalRefundSubtotal, credit: 0 });
      }
      if (totalRefundTax > 0) {
        const taxAccount = await requireAccountByCode(this.accounts, SYSTEM_ACCOUNTS.TAX_PAYABLE);
        journalLines.push({ accountId: taxAccount.id, debit: totalRefundTax, credit: 0 });
      }
      if (totalAmount > 0) {
        const settleAccount = await requireAccountByCode(
          this.accounts,
          cashAccountForMethod(dto.refundMethod),
        );
        journalLines.push({ accountId: settleAccount.id, debit: 0, credit: totalAmount });
      }
      if (totalRestockValue > 0) {
        const inventoryAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.INVENTORY,
        );
        const cogsAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.COST_OF_GOODS_SOLD,
        );
        journalLines.push({ accountId: inventoryAccount.id, debit: totalRestockValue, credit: 0 });
        journalLines.push({ accountId: cogsAccount.id, debit: 0, credit: totalRestockValue });
      }
      if (journalLines.length > 0) {
        await this.journal.postEntry(
          {
            lines: journalLines,
            currency,
            refType: "sale_return",
            refId: number,
            description: `Sale return ${number}`,
          },
          session,
          actor,
        );
      }

      return this.returns.create(
        persist<SaleReturn>({
          number,
          saleId: dto.saleId,
          storeId: sale.storeId,
          customerId: sale.customerId,
          cashSessionId: dto.cashSessionId,
          lines: postedLines,
          refundMethod: dto.refundMethod,
          reason: dto.reason,
          total,
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
    });
  }

  private async findSaleForUpdate(saleId: string, session: ClientSession): Promise<Sale> {
    const sale = await this.sales.findById(saleId, { session });
    if (!sale) throw new DomainException(ErrorCode.NOT_FOUND, "Sale not found", 404);
    return sale;
  }
}
