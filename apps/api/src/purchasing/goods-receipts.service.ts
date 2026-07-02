import { Injectable } from "@nestjs/common";
import { ErrorCode, multiplyMoney, StockMovementType } from "@supershop/shared";
import type { ClientSession, UpdateQuery } from "mongoose";
import type { Principal } from "../auth/principal";
import { AccountRepository, requireAccountByCode } from "../accounting/account.repository";
import { JournalService } from "../accounting/journal.service";
import { SYSTEM_ACCOUNTS } from "../accounting/system-accounts";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { MoneyEmbed } from "../common/schema/money.schema";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { StockService } from "../inventory/stock.service";
import { assertUnitCostWithinTolerance } from "./goods-receipt-invariants";
import { GoodsReceiptRepository } from "./goods-receipt.repository";
import type { GoodsReceipt } from "./goods-receipt.schema";
import type { PurchaseOrder, PurchaseOrderLine } from "./purchase-order.schema";
import { PurchaseOrderRepository } from "./purchase-order.repository";

export interface CreateGoodsReceiptInput {
  poId: string;
  lines: Array<{
    productId: string;
    qty: number;
    unitCost?: MoneyEmbed;
    batchNo?: string;
    expiryDate?: Date;
  }>;
}

function allLinesReceived(lines: PurchaseOrderLine[]): boolean {
  return lines.every((l) => l.receivedQty >= l.qty);
}

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    private readonly receipts: GoodsReceiptRepository,
    private readonly orders: PurchaseOrderRepository,
    private readonly stock: StockService,
    private readonly journal: JournalService,
    private readonly accounts: AccountRepository,
  ) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.receipts.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<GoodsReceipt> {
    const grn = await this.receipts.findById(id);
    if (!grn) throw new DomainException(ErrorCode.NOT_FOUND, "Goods receipt not found", 404);
    return grn;
  }

  /**
   * Posts a GRN atomically: validates against the PO's remaining quantities, posts a stock
   * RECEIPT (batch + ledger + inventory cache, via StockService's session-composable primitive)
   * per line, advances the PO's receivedQty/status, and writes the GRN document — all in ONE
   * transaction (Hard Rule 2). The PO is re-read inside the transaction so two concurrent GRNs
   * against the same PO conflict at the storage layer and one retries against fresh quantities,
   * the same guard StockService relies on for FEFO batch decrements.
   */
  async create(input: CreateGoodsReceiptInput, actor?: Principal): Promise<GoodsReceipt> {
    return this.txn.withTransaction(async (session) => {
      const po = await this.findPoForUpdate(input.poId, session);
      if (po.status !== "APPROVED" && po.status !== "PARTIALLY_RECEIVED") {
        throw new DomainException(
          ErrorCode.CONFLICT,
          "Goods can only be received against an APPROVED or PARTIALLY_RECEIVED purchase order",
          409,
        );
      }

      const byProduct = new Map(po.lines.map((l) => [String(l.productId), l]));
      const updatedReceived = new Map<string, number>();
      const number = await this.counters.nextFormatted("goods_receipt", "GRN", {
        year: new Date().getFullYear(),
        session,
      });

      const postedLines = [];
      let totalReceivedValue = 0;
      let currency: MoneyEmbed["currency"] | undefined;
      for (const line of input.lines) {
        const poLine = byProduct.get(line.productId);
        if (!poLine) {
          throw new DomainException(
            ErrorCode.VALIDATION_ERROR,
            `Product ${line.productId} is not on this purchase order`,
            400,
          );
        }
        const remaining = poLine.qty - poLine.receivedQty;
        if (line.qty > remaining) {
          throw new DomainException(
            ErrorCode.CONFLICT,
            `Over-receipt: ${line.qty} exceeds the remaining ${remaining} for this product`,
            409,
          );
        }
        if (line.unitCost) {
          assertUnitCostWithinTolerance(line.unitCost, poLine.unitCost, line.productId);
        }
        const unitCost = line.unitCost ?? poLine.unitCost;
        if (currency === undefined) currency = unitCost.currency;
        else if (currency !== unitCost.currency) {
          throw new DomainException(
            ErrorCode.VALIDATION_ERROR,
            "All lines must use the same currency",
            400,
          );
        }
        totalReceivedValue += multiplyMoney(unitCost, line.qty).amount;
        await this.stock.postReceiptLine({
          session,
          storeId: String(po.storeId),
          productId: line.productId,
          qty: line.qty,
          costPrice: unitCost,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate ?? null,
          type: StockMovementType.RECEIPT,
          refType: "goods_receipt",
          refId: number,
          actor,
        });
        updatedReceived.set(line.productId, poLine.receivedQty + line.qty);
        postedLines.push({
          productId: line.productId,
          qty: line.qty,
          unitCost,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate ?? null,
        });
      }

      const newLines = po.lines.map((l) => ({
        ...l,
        receivedQty: updatedReceived.get(String(l.productId)) ?? l.receivedQty,
      }));
      await this.orders.updateById(
        input.poId,
        persist<UpdateQuery<PurchaseOrder>>({
          $set: {
            lines: newLines,
            status: allLinesReceived(newLines) ? "RECEIVED" : "PARTIALLY_RECEIVED",
            updatedBy: actor?.userId,
          },
        }),
        { session },
      );

      if (totalReceivedValue > 0) {
        const inventoryAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.INVENTORY,
        );
        const payableAccount = await requireAccountByCode(
          this.accounts,
          SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE,
        );
        await this.journal.postEntry(
          {
            lines: [
              { accountId: inventoryAccount.id, debit: totalReceivedValue, credit: 0 },
              { accountId: payableAccount.id, debit: 0, credit: totalReceivedValue },
            ],
            currency: currency!,
            refType: "goods_receipt",
            refId: number,
            description: `Goods receipt ${number}`,
          },
          session,
          actor,
        );
      }

      return this.receipts.create(
        persist<GoodsReceipt>({
          number,
          poId: input.poId,
          supplierId: po.supplierId,
          storeId: po.storeId,
          lines: postedLines,
          status: "POSTED",
          createdBy: actor?.userId,
          updatedBy: actor?.userId,
        }),
        { session },
      );
    });
  }

  private async findPoForUpdate(poId: string, session: ClientSession): Promise<PurchaseOrder> {
    const po = await this.orders.findById(poId, { session });
    if (!po) throw new DomainException(ErrorCode.NOT_FOUND, "Purchase order not found", 404);
    return po;
  }
}
