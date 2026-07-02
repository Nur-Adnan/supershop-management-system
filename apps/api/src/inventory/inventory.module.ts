import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CatalogModule } from "../catalog/catalog.module";
import { CountersModule } from "../counters/counters.module";
import { StoresModule } from "../stores/stores.module";
import { InventoryController } from "./inventory.controller";
import { InventoryRepository } from "./inventory.repository";
import { Inventory, InventorySchema } from "./inventory.schema";
import { StockAdjustment, StockAdjustmentSchema } from "./stock-adjustment.schema";
import { StockBatchRepository } from "./stock-batch.repository";
import { StockBatch, StockBatchSchema } from "./stock-batch.schema";
import { StockMovementRepository } from "./stock-movement.repository";
import { StockMovement, StockMovementSchema } from "./stock-movement.schema";
import { StockTransfer, StockTransferSchema } from "./stock-transfer.schema";
import { StockService } from "./stock.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inventory.name, schema: InventorySchema },
      { name: StockBatch.name, schema: StockBatchSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: StockTransfer.name, schema: StockTransferSchema },
    ]),
    CountersModule, // business-number sequences (self-sufficient for testing)
    CatalogModule, // ProductsRepository (ref validation)
    StoresModule, // StoresRepository (ref validation)
  ],
  controllers: [InventoryController],
  providers: [StockService, InventoryRepository, StockBatchRepository, StockMovementRepository],
  exports: [StockService],
})
export class InventoryModule {}
