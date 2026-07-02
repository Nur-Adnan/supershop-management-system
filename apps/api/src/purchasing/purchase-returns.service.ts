import { Injectable } from "@nestjs/common";
import { ErrorCode, multiplyMoney, StockMovementType, type Currency } from "@supershop/shared";
import type { Principal } from "../auth/principal";
import { AccountRepository, requireAccountByCode } from "../accounting/account.repository";
import { JournalService } from "../accounting/journal.service";
import { SYSTEM_ACCOUNTS } from "../accounting/system-accounts";
import { ProductsRepository } from "../catalog/product.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { StockService } from "../inventory/stock.service";
import { StoresRepository } from "../stores/store.repository";
import { SuppliersRepository } from "../suppliers/supplier.repository";
import { GoodsReceiptRepository } from "./goods-receipt.repository";
import { PurchaseReturnRepository } from "./purchase-return.repository";
import type { PurchaseReturn } from "./purchase-return.schema";

export interface CreatePurchaseReturnInput {
  supplierId: string;
  storeId: string;
  grnId?: string;
  reason: string;
  lines: Array<{ productId: string; qty: number }>;
}

@Injectable()
export class PurchaseReturnsService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    private readonly returns: PurchaseReturnRepository,
    private readonly grns: GoodsReceiptRepository,
    private readonly stock: StockService,
    private readonly stores: StoresRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly products: ProductsRepository,
    private readonly journal: JournalService,
    private readonly accounts: AccountRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.returns.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<PurchaseReturn> {
    const ret = await this.returns.findById(id);
    if (!ret) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase return not found", 404);
    return ret;
  }

  /** Sends stock back to a supplier: FEFO-consumes it from the store and appends a RETURN
   * movement per allocated lot — atomic with the return document (Hard Rule 2). */
  async create(input: CreatePurchaseReturnInput, actor?: Principal): Promise<PurchaseReturn> {
    if (!(await this.suppliers.findById(input.supplierId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Supplier does not exist", 400);
    }
    if (!(await this.stores.findById(input.storeId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
    if (input.grnId && !(await this.grns.findById(input.grnId))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Goods receipt does not exist", 400);
    }
    for (const line of input.lines) {
      if (!(await this.products.findById(line.productId))) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          `Product ${line.productId} does not exist`,
          400,
        );
      }
    }

    return this.txn.withTransaction(async (session) => {
      const number = await this.counters.nextFormatted("purchase_return", "PRT", {
        year: new Date().getFullYear(),
        session,
      });
      let totalCostValue = 0;
      let currency: Currency | undefined;
      for (const line of input.lines) {
        const moved = await this.stock.postOutboundLine({
          session,
          storeId: input.storeId,
          productId: line.productId,
          qty: line.qty,
          type: StockMovementType.RETURN,
          refType: "purchase_return",
          refId: number,
          reason: input.reason,
          actor,
        });
        for (const lot of moved) {
          if (currency === undefined) currency = lot.costPrice.currency;
          else if (currency !== lot.costPrice.currency) {
            throw new DomainException(
              ErrorCode.VALIDATION_ERROR,
              "All lines must use the same currency",
              400,
            );
          }
          totalCostValue += multiplyMoney(lot.costPrice, lot.qty).amount;
        }
      }

      if (totalCostValue > 0 && currency) {
        // Dr Accounts Payable (reduces what we owe the supplier) / Cr Inventory (restocked value
        // leaves the books) — the reverse of a GRN's posting.
        const payableAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
        );
        const inventoryAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.INVENTORY,
        );
        await this.journal.postEntry(
          {
            lines: [
              { accountId: payableAccount.id, debit: totalCostValue, credit: 0 },
              { accountId: inventoryAccount.id, debit: 0, credit: totalCostValue },
            ],
            currency,
            refType: "purchase_return",
            refId: number,
            description: `Purchase return ${number}`,
          },
          session,
          actor,
        );
      }

      return this.returns.create(
        persist<PurchaseReturn>({
          number,
          supplierId: input.supplierId,
          storeId: input.storeId,
          grnId: input.grnId,
          lines: input.lines,
          reason: input.reason,
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
    });
  }
}
