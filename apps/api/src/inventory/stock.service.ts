import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode, StockMovementType } from "@supershop/shared";
import type { ClientSession, Model, UpdateQuery } from "mongoose";
import type { Principal } from "../auth/principal";
import { ProductsRepository } from "../catalog/product.repository";
import { DomainException } from "../common/domain.exception";
import { persist } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { MoneyEmbed } from "../common/schema/money.schema";
import { CountersService } from "../counters/counters.service";
import { TransactionService } from "../database/transaction.service";
import { StoresRepository } from "../stores/store.repository";
import { allocateFefo, type FefoBatch } from "./fefo";
import { Inventory } from "./inventory.schema";
import { InventoryRepository } from "./inventory.repository";
import { StockAdjustment } from "./stock-adjustment.schema";
import { StockBatch } from "./stock-batch.schema";
import { StockBatchRepository } from "./stock-batch.repository";
import { StockMovement } from "./stock-movement.schema";
import { StockMovementRepository } from "./stock-movement.repository";
import { StockTransfer } from "./stock-transfer.schema";

export interface ReceiveInput {
  storeId: string;
  lines: Array<{
    productId: string;
    qty: number;
    costPrice: MoneyEmbed;
    batchNo?: string;
    expiryDate?: Date | null;
  }>;
}
export interface AdjustInput {
  storeId: string;
  reason: string;
  lines: Array<{
    productId: string;
    qty: number;
    costPrice?: MoneyEmbed;
    batchNo?: string;
    expiryDate?: Date | null;
  }>;
}
export interface TransferInput {
  fromStoreId: string;
  toStoreId: string;
  lines: Array<{ productId: string; qty: number }>;
}

/** A lot as consumed by FEFO, carried to the destination on a transfer to preserve identity. */
interface MovedLot {
  qty: number;
  costPrice: MoneyEmbed;
  batchNo?: string;
  expiryDate?: Date | null;
}

export interface InboundParams {
  session: ClientSession;
  storeId: string;
  productId: string;
  qty: number;
  costPrice: MoneyEmbed;
  batchNo?: string;
  expiryDate?: Date | null;
  type: StockMovementType;
  refType: string;
  refId: string;
  actor?: Principal;
}

export interface OutboundParams {
  session: ClientSession;
  storeId: string;
  productId: string;
  qty: number;
  type: StockMovementType;
  refType: string;
  refId: string;
  reason?: string;
  actor?: Principal;
}

@Injectable()
export class StockService {
  constructor(
    private readonly txn: TransactionService,
    private readonly counters: CountersService,
    @InjectModel(Inventory.name) private readonly invModel: Model<Inventory>,
    @InjectModel(StockBatch.name) private readonly batchModel: Model<StockBatch>,
    @InjectModel(StockMovement.name) private readonly moveModel: Model<StockMovement>,
    @InjectModel(StockAdjustment.name) private readonly adjModel: Model<StockAdjustment>,
    @InjectModel(StockTransfer.name) private readonly transferModel: Model<StockTransfer>,
    private readonly invRepo: InventoryRepository,
    private readonly batchRepo: StockBatchRepository,
    private readonly moveRepo: StockMovementRepository,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
  ) {}

  // --- reads ---
  paginateInventory(query: ParsedPageQuery, baseFilter = {}) {
    return this.invRepo.paginate(query, baseFilter);
  }
  paginateBatches(query: ParsedPageQuery, baseFilter = {}) {
    return this.batchRepo.paginate(query, baseFilter);
  }
  paginateMovements(query: ParsedPageQuery, baseFilter = {}) {
    return this.moveRepo.paginate(query, baseFilter);
  }

  // --- write operations (each fully transactional) ---

  /** Receive new stock: one new batch + a RECEIPT movement + inventory bump per line. */
  async receive(dto: ReceiveInput, actor?: Principal) {
    await this.assertStore(dto.storeId);
    for (const line of dto.lines) await this.assertProduct(line.productId);
    return this.txn.withTransaction(async (session) => {
      const number = await this.nextNumber("stock_receipt", "RCV", session);
      const lines = [];
      for (const line of dto.lines) {
        lines.push(
          await this.postReceiptLine({
            session,
            storeId: dto.storeId,
            productId: line.productId,
            qty: line.qty,
            costPrice: line.costPrice,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate ?? null,
            type: StockMovementType.RECEIPT,
            refType: "receipt",
            refId: number,
            actor,
          }),
        );
      }
      return { number, storeId: dto.storeId, lines };
    });
  }

  /** Manual correction: positive lines add a batch, negative lines FEFO-consume (wastage). */
  async adjust(dto: AdjustInput, actor?: Principal) {
    await this.assertStore(dto.storeId);
    for (const line of dto.lines) await this.assertProduct(line.productId);
    return this.txn.withTransaction(async (session) => {
      const number = await this.nextNumber("stock_adjustment", "ADJ", session);
      for (const line of dto.lines) {
        if (line.qty > 0) {
          await this.postReceiptLine({
            session,
            storeId: dto.storeId,
            productId: line.productId,
            qty: line.qty,
            costPrice: line.costPrice ?? { amount: 0, currency: "BDT" },
            batchNo: line.batchNo,
            expiryDate: line.expiryDate ?? null,
            type: StockMovementType.ADJUSTMENT,
            refType: "adjustment",
            refId: number,
            actor,
          });
        } else {
          await this.postOutboundLine({
            session,
            storeId: dto.storeId,
            productId: line.productId,
            qty: Math.abs(line.qty),
            type: StockMovementType.ADJUSTMENT,
            refType: "adjustment",
            refId: number,
            reason: dto.reason,
            actor,
          });
        }
      }
      await this.adjModel.create(
        [
          persist<StockAdjustment>({
            number,
            storeId: dto.storeId,
            lines: dto.lines,
            reason: dto.reason,
            approvedBy: actor?.userId,
            createdBy: actor?.userId,
            updatedBy: actor?.userId,
          }),
        ],
        { session },
      );
      return { number };
    });
  }

  /** Inter-store transfer: FEFO-consume at source, recreate the same lots at destination. */
  async transfer(dto: TransferInput, actor?: Principal) {
    if (dto.fromStoreId === dto.toStoreId) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "Cannot transfer to the same store",
        400,
      );
    }
    await this.assertStore(dto.fromStoreId);
    await this.assertStore(dto.toStoreId);
    for (const line of dto.lines) await this.assertProduct(line.productId);
    return this.txn.withTransaction(async (session) => {
      const number = await this.nextNumber("stock_transfer", "TRF", session);
      for (const line of dto.lines) {
        const moved = await this.postOutboundLine({
          session,
          storeId: dto.fromStoreId,
          productId: line.productId,
          qty: line.qty,
          type: StockMovementType.TRANSFER_OUT,
          refType: "transfer",
          refId: number,
          actor,
        });
        for (const lot of moved) {
          await this.postReceiptLine({
            session,
            storeId: dto.toStoreId,
            productId: line.productId,
            qty: lot.qty,
            costPrice: lot.costPrice,
            batchNo: lot.batchNo,
            expiryDate: lot.expiryDate ?? null,
            type: StockMovementType.TRANSFER_IN,
            refType: "transfer",
            refId: number,
            actor,
          });
        }
      }
      await this.transferModel.create(
        [
          persist<StockTransfer>({
            number,
            fromStoreId: dto.fromStoreId,
            toStoreId: dto.toStoreId,
            lines: dto.lines,
            status: "RECEIVED",
            createdBy: actor?.userId,
            updatedBy: actor?.userId,
          }),
        ],
        { session },
      );
      return { number };
    });
  }

  // --- engine primitives ---
  // Public so other modules (e.g. Purchasing's GRN posting) can compose them inside their OWN
  // withTransaction call — a nested session.withTransaction is not how Mongo transactions work,
  // so a caller that needs "stock movement + its own doc writes" atomic together must call these
  // directly with its own session, rather than going through receive()/adjust()/transfer().
  // Always pass a session from an active transaction; no ref/store/product validation here —
  // callers validate against whatever domain object (PO, adjustment, etc.) they already resolved.

  async postReceiptLine(
    p: InboundParams,
  ): Promise<{ productId: string; batchId: string; qty: number }> {
    const [batch] = await this.batchModel.create(
      [
        persist<StockBatch>({
          productId: p.productId,
          storeId: p.storeId,
          batchNo: p.batchNo,
          expiryDate: p.expiryDate ?? null,
          qty: p.qty,
          costPrice: p.costPrice,
          receivedAt: new Date(),
          createdBy: p.actor?.userId,
          updatedBy: p.actor?.userId,
        }),
      ],
      { session: p.session },
    );
    if (!batch) {
      throw new DomainException(ErrorCode.INTERNAL_ERROR, "Failed to create stock batch", 500);
    }
    await this.recordMovement(p.session, {
      productId: p.productId,
      storeId: p.storeId,
      batchId: batch._id,
      type: p.type,
      qty: p.qty,
      unitCost: p.costPrice,
      refType: p.refType,
      refId: p.refId,
      actor: p.actor,
    });
    await this.adjustInventory(p.session, p.productId, p.storeId, p.qty, p.actor);
    return { productId: p.productId, batchId: String(batch._id), qty: p.qty };
  }

  async postOutboundLine(p: OutboundParams): Promise<MovedLot[]> {
    const batches = await this.batchModel
      .find({ productId: p.productId, storeId: p.storeId, qty: { $gt: 0 } })
      .session(p.session)
      .lean();
    const fefoBatches: FefoBatch[] = batches.map((b) => ({
      id: String(b._id),
      qty: b.qty,
      expiryDate: b.expiryDate ?? null,
    }));
    const allocations = allocateFefo(fefoBatches, p.qty); // throws INSUFFICIENT_STOCK
    const byId = new Map(batches.map((b) => [String(b._id), b]));
    const moved: MovedLot[] = [];
    for (const alloc of allocations) {
      const batch = byId.get(alloc.batchId);
      if (!batch) continue;
      // The $inc write conflicts with any concurrent uncommitted decrement of the same batch,
      // so the transaction retries against fresh quantities — this is the oversell guard.
      await this.batchModel.updateOne(
        { _id: batch._id },
        { $inc: { qty: -alloc.qty } },
        { session: p.session },
      );
      await this.recordMovement(p.session, {
        productId: p.productId,
        storeId: p.storeId,
        batchId: batch._id,
        type: p.type,
        qty: -alloc.qty,
        unitCost: batch.costPrice,
        refType: p.refType,
        refId: p.refId,
        reason: p.reason,
        actor: p.actor,
      });
      moved.push({
        qty: alloc.qty,
        costPrice: batch.costPrice,
        batchNo: batch.batchNo,
        expiryDate: batch.expiryDate ?? null,
      });
    }
    await this.adjustInventory(p.session, p.productId, p.storeId, -p.qty, p.actor);
    return moved;
  }

  private async recordMovement(
    session: ClientSession,
    m: {
      productId: string;
      storeId: string;
      batchId?: unknown;
      type: StockMovementType;
      qty: number;
      unitCost?: MoneyEmbed;
      refType?: string;
      refId?: string;
      reason?: string;
      actor?: Principal;
    },
  ): Promise<void> {
    await this.moveModel.create(
      [
        persist<StockMovement>({
          productId: m.productId,
          storeId: m.storeId,
          batchId: m.batchId,
          type: m.type,
          qty: m.qty,
          unitCost: m.unitCost,
          refType: m.refType,
          refId: m.refId,
          reason: m.reason,
          createdBy: m.actor?.userId,
          updatedBy: m.actor?.userId,
        }),
      ],
      { session },
    );
  }

  /** Upsert the (product, store) cache row, $inc its quantity in the same transaction. */
  private async adjustInventory(
    session: ClientSession,
    productId: string,
    storeId: string,
    delta: number,
    actor?: Principal,
  ): Promise<void> {
    await this.invModel.updateOne(
      { productId, storeId },
      persist<UpdateQuery<Inventory>>({
        $inc: { currentQty: delta },
        $setOnInsert: { reservedQty: 0, createdBy: actor?.userId },
        $set: { updatedBy: actor?.userId },
      }),
      { upsert: true, session },
    );
  }

  private nextNumber(counter: string, prefix: string, session: ClientSession): Promise<string> {
    return this.counters.nextFormatted(counter, prefix, {
      year: new Date().getFullYear(),
      session,
    });
  }

  private async assertStore(id: string): Promise<void> {
    if (!(await this.stores.findById(id))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Store does not exist", 400);
    }
  }

  private async assertProduct(id: string): Promise<void> {
    if (!(await this.products.findById(id))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Product does not exist", 400);
    }
  }
}
