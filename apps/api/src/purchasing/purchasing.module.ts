import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AccountingModule } from "../accounting/accounting.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CountersModule } from "../counters/counters.module";
import { InventoryModule } from "../inventory/inventory.module";
import { StoresModule } from "../stores/stores.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { GoodsReceiptsController } from "./goods-receipts.controller";
import { GoodsReceiptRepository } from "./goods-receipt.repository";
import { GoodsReceipt, GoodsReceiptSchema } from "./goods-receipt.schema";
import { GoodsReceiptsService } from "./goods-receipts.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrderRepository } from "./purchase-order.repository";
import { PurchaseOrder, PurchaseOrderSchema } from "./purchase-order.schema";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PurchaseReturnsController } from "./purchase-returns.controller";
import { PurchaseReturnRepository } from "./purchase-return.repository";
import { PurchaseReturn, PurchaseReturnSchema } from "./purchase-return.schema";
import { PurchaseReturnsService } from "./purchase-returns.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: GoodsReceipt.name, schema: GoodsReceiptSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
    ]),
    CountersModule,
    CatalogModule, // ProductsRepository (ref validation)
    StoresModule, // StoresRepository (ref validation)
    SuppliersModule, // SuppliersRepository (ref validation)
    InventoryModule, // StockService (postReceiptLine / postOutboundLine)
    AccountingModule, // JournalService + AccountRepository (GRN/purchase-return journal posting)
  ],
  controllers: [PurchaseOrdersController, GoodsReceiptsController, PurchaseReturnsController],
  providers: [
    PurchaseOrdersService,
    PurchaseOrderRepository,
    GoodsReceiptsService,
    GoodsReceiptRepository,
    PurchaseReturnsService,
    PurchaseReturnRepository,
  ],
  exports: [PurchaseOrdersService, GoodsReceiptsService, PurchaseReturnsService],
})
export class PurchasingModule {}
