import { Injectable } from "@nestjs/common";
import {
  addMoney,
  ErrorCode,
  PERMISSIONS,
  StockMovementType,
  subtractMoney,
} from "@supershop/shared";
import { applyRateBps, multiplyMoney } from "@supershop/shared";
import { hasAllPermissions } from "../auth/authz";
import type { Principal } from "../auth/principal";
import { AccountRepository, requireAccountByCode } from "../accounting/account.repository";
import { JournalService } from "../accounting/journal.service";
import type { JournalLineInput } from "../accounting/journal-invariants";
import { cashAccountForMethod, SYSTEM_ACCOUNTS } from "../accounting/system-accounts";
import { ProductsRepository } from "../catalog/product.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { MoneyEmbed } from "../common/schema/money.schema";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { StockService } from "../inventory/stock.service";
import { StoresRepository } from "../stores/store.repository";
import { CustomersRepository } from "../customers/customer.repository";
import { CashSessionRepository } from "./cash-session.repository";
import { CashTransaction } from "./cash-transaction.schema";
import { CashTransactionRepository } from "./cash-transaction.repository";
import { Payment } from "./payment.schema";
import { PaymentRepository } from "./payment.repository";
import { assertQtyMatchesUnit } from "./sale-invariants";
import { Sale } from "./sale.schema";
import { SaleRepository } from "./sale.repository";

export interface CheckoutLineInput {
  productId: string;
  qty: number;
  unitPrice?: MoneyEmbed;
}
export interface CheckoutPaymentInput {
  method: string;
  amount: MoneyEmbed;
}
export interface CheckoutInput {
  storeId: string;
  cashSessionId: string;
  customerId?: string;
  lines: CheckoutLineInput[];
  discountTotal?: MoneyEmbed;
  payments: CheckoutPaymentInput[];
}

interface BuiltLine {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: MoneyEmbed;
  taxBps: number;
  lineSubtotal: MoneyEmbed;
  lineTax: MoneyEmbed;
  lineTotal: MoneyEmbed;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    private readonly stock: StockService,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
    private readonly customers: CustomersRepository,
    private readonly cashSessions: CashSessionRepository,
    private readonly sales: SaleRepository,
    private readonly payments: PaymentRepository,
    private readonly cashTransactions: CashTransactionRepository,
    private readonly journal: JournalService,
    private readonly accounts: AccountRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.sales.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<Sale> {
    const sale = await this.sales.findById(id);
    if (!sale) throw new DomainException(ErrorCode.NOT_FOUND, "Sale not found", 404);
    return sale;
  }

  /**
   * POS checkout — the highest-stakes transaction in the system. Validates against the open
   * cash session and current catalog/stock state, then atomically (Hard Rule 2): FEFO-decrements
   * stock per line (StockService's session-composable primitive), records each payment (and a
   * cash-drawer entry for CASH, a credit-limit-checked balance bump for CREDIT), and creates the
   * invoice — all in ONE transaction.
   */
  async checkout(dto: CheckoutInput, actor?: Principal): Promise<Sale> {
    if (!(await this.stores.findById(dto.storeId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
    const cashSession = await this.cashSessions.findById(dto.cashSessionId);
    if (!cashSession) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Cash session does not exist", 400);
    }
    if (cashSession.status !== "OPEN") {
      throw new DomainException(ErrorCode.CONFLICT, "Cash session is not open", 409);
    }
    if (String(cashSession.storeId) !== dto.storeId) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Cash session does not belong to this store",
        400,
      );
    }

    const hasCredit = dto.payments.some((p) => p.method === "CREDIT");
    if (hasCredit && !dto.customerId) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "A customer is required for a CREDIT payment",
        400,
      );
    }
    if (dto.customerId && !(await this.customers.findById(dto.customerId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Customer does not exist", 400);
    }

    const built: BuiltLine[] = [];
    for (const line of dto.lines) {
      const product = await this.products.findById(line.productId);
      if (!product) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Product ${line.productId} does not exist`,
          400,
        );
      }
      assertQtyMatchesUnit(product.isWeighted, line.qty);
      if (line.unitPrice && !(actor && hasAllPermissions(actor, [PERMISSIONS.PROMOTIONS_MANAGE]))) {
        throw new DomainException(
          ErrorCode.FORBIDDEN,
          "Overriding a line's sell price requires the promotions.manage permission",
          403,
        );
      }
      const unitPrice = line.unitPrice ?? product.pricing.sellPrice;
      const lineSubtotal = multiplyMoney(unitPrice, line.qty);
      const lineTax = applyRateBps(lineSubtotal, product.taxRateBps);
      built.push({
        productId: line.productId,
        sku: product.sku,
        name: product.name,
        qty: line.qty,
        unitPrice,
        taxBps: product.taxRateBps,
        lineSubtotal,
        lineTax,
        lineTotal: addMoney(lineSubtotal, lineTax),
      });
    }
    if (new Set(built.map((l) => l.unitPrice.currency)).size > 1) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "All lines must use the same currency",
        400,
      );
    }
    const currency = built[0]!.unitPrice.currency;

    let subtotal = built[0]!.lineSubtotal;
    let taxTotal = built[0]!.lineTax;
    for (let i = 1; i < built.length; i++) {
      subtotal = addMoney(subtotal, built[i]!.lineSubtotal);
      taxTotal = addMoney(taxTotal, built[i]!.lineTax);
    }
    const discountTotal = dto.discountTotal ?? { amount: 0, currency };
    if (discountTotal.currency !== currency) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "discountTotal currency must match the sale",
        400,
      );
    }
    if (discountTotal.amount > subtotal.amount) {
      // A discount applies to the goods value, not tax — capping it here also guarantees the
      // journal's net-revenue leg (subtotal - discount) is never negative.
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Discount cannot exceed the subtotal",
        400,
      );
    }
    const total = subtractMoney(addMoney(subtotal, taxTotal), discountTotal);
    if (total.amount < 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Discount exceeds the sale subtotal and tax",
        400,
      );
    }

    const paymentsTotal = dto.payments.reduce((sum, p) => sum + p.amount.amount, 0);
    if (dto.payments.some((p) => p.amount.currency !== currency)) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Payment currency must match the sale",
        400,
      );
    }
    if (paymentsTotal !== total.amount) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        `Payments (${paymentsTotal}) must sum to the sale total (${total.amount})`,
        400,
      );
    }

    return this.txn.withTransaction(async (session) => {
      const number = await this.counters.nextFormatted("sale", "INV", {
        year: new Date().getFullYear(),
        session,
      });

      let cogsTotal = 0;
      for (const line of dto.lines) {
        const moved = await this.stock.postOutboundLine({
          session,
          storeId: dto.storeId,
          productId: line.productId,
          qty: line.qty,
          type: StockMovementType.SALE,
          refType: "sale",
          refId: number,
          actor,
        });
        for (const lot of moved) {
          if (lot.costPrice.currency !== currency) {
            throw new DomainException(
              ErrorCode.VALIDATION_ERROR,
              `Product ${line.productId}'s cost currency does not match the sale currency`,
              400,
            );
          }
          cogsTotal += multiplyMoney(lot.costPrice, lot.qty).amount;
        }
      }

      for (const payment of dto.payments) {
        await this.payments.create(
          persist<Payment>({
            direction: "IN",
            method: payment.method,
            refType: "sale",
            refId: number,
            amount: payment.amount,
            storeId: dto.storeId,
            customerId: dto.customerId,
            createdBy: actor?.userId,
            updatedBy: actor?.userId,
          }),
          { session },
        );
        if (payment.method === "CASH") {
          await this.cashTransactions.create(
            persist<CashTransaction>({
              sessionId: dto.cashSessionId,
              type: "SALE",
              amount: payment.amount,
              refType: "sale",
              refId: number,
              createdBy: actor?.userId,
              updatedBy: actor?.userId,
            }),
            { session },
          );
        } else if (payment.method === "CREDIT") {
          // dto.customerId is guaranteed set (validated above whenever a CREDIT payment is present).
          const customer = await this.customers.findOne({ _id: dto.customerId }, { session });
          if (!customer) throw new DomainException(ErrorCode.NOT_FOUND, "Customer not found", 404);
          const newBalance = customer.openingBalance.amount + payment.amount.amount;
          if (newBalance > customer.creditLimit.amount) {
            throw new DomainException(
              ErrorCode.CONFLICT,
              "Sale would exceed the customer's credit limit",
              409,
            );
          }
          await this.customers.updateById(
            dto.customerId!,
            { $inc: { "openingBalance.amount": payment.amount.amount } },
            { session },
          );
        }
      }

      // Balanced double-entry posting for the whole sale, atomic with everything above:
      //   Dr [Cash/AR per payment method]         = payment amounts (= total)
      //   Cr Sales Revenue                        = subtotal - discountTotal
      //   Cr Tax Payable                          = taxTotal (only if > 0)
      //   Dr Cost of Goods Sold / Cr Inventory    = cogsTotal (only if > 0)
      // Debit side (total + cogsTotal) always equals credit side by construction.
      const journalLines: JournalLineInput[] = [];
      const paymentAccountTotals = new Map<string, number>();
      for (const payment of dto.payments) {
        const code = cashAccountForMethod(payment.method);
        paymentAccountTotals.set(
          code,
          (paymentAccountTotals.get(code) ?? 0) + payment.amount.amount,
        );
      }
      for (const [code, amount] of paymentAccountTotals) {
        const account = await requireAccountByCode(this.accounts, code);
        journalLines.push({ accountId: account.id, debit: amount, credit: 0 });
      }
      const netRevenue = subtotal.amount - discountTotal.amount;
      if (netRevenue > 0) {
        const revenueAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.SALES_REVENUE,
        );
        journalLines.push({ accountId: revenueAccount.id, debit: 0, credit: netRevenue });
      }
      if (taxTotal.amount > 0) {
        const taxAccount = await requireAccountByCode(this.accounts, SYSTEM_ACCOUNTS.TAX_PAYABLE);
        journalLines.push({ accountId: taxAccount.id, debit: 0, credit: taxTotal.amount });
      }
      if (cogsTotal > 0) {
        const cogsAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.COST_OF_GOODS_SOLD,
        );
        const inventoryAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.INVENTORY,
        );
        journalLines.push({ accountId: cogsAccount.id, debit: cogsTotal, credit: 0 });
        journalLines.push({ accountId: inventoryAccount.id, debit: 0, credit: cogsTotal });
      }
      await this.journal.postEntry(
        {
          lines: journalLines,
          currency,
          refType: "sale",
          refId: number,
          description: `POS sale ${number}`,
        },
        session,
        actor,
      );

      return this.sales.create(
        persist<Sale>({
          number,
          storeId: dto.storeId,
          customerId: dto.customerId,
          cashSessionId: dto.cashSessionId,
          lines: built.map((l) => ({
            productId: l.productId,
            sku: l.sku,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxBps: l.taxBps,
            lineSubtotal: l.lineSubtotal,
            lineTax: l.lineTax,
            lineTotal: l.lineTotal,
            refundedQty: 0,
          })),
          subtotal,
          taxTotal,
          discountTotal,
          total,
          payments: dto.payments,
          status: "COMPLETED",
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
    });
  }
}
