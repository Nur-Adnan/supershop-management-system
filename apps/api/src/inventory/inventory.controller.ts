import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { AdjustStockDto, ReceiveStockDto, TransferStockDto } from "./inventory.dto";
import { StockService } from "./stock.service";

const INVENTORY_QUERY = {
  filter: ["productId", "storeId"],
  sort: ["currentQty", "updatedAt", "createdAt"],
};
const BATCH_QUERY = {
  filter: ["productId", "storeId", "batchNo"],
  sort: ["expiryDate", "createdAt", "qty"],
};
const MOVEMENT_QUERY = {
  filter: ["productId", "storeId", "type", "refType", "refId"],
  sort: ["createdAt", "qty"],
};

@ApiTags("inventory")
@ApiBearerAuth()
@Controller("inventory")
@RequirePermissions(PERMISSIONS.INVENTORY_READ)
export class InventoryController {
  constructor(private readonly stock: StockService) {}

  @Get()
  levels(@Query() query: Record<string, unknown>) {
    return this.stock.paginateInventory(parsePageQuery(query, INVENTORY_QUERY));
  }

  @Get("batches")
  batches(@Query() query: Record<string, unknown>) {
    return this.stock.paginateBatches(parsePageQuery(query, BATCH_QUERY));
  }

  @Get("movements")
  movements(@Query() query: Record<string, unknown>) {
    return this.stock.paginateMovements(parsePageQuery(query, MOVEMENT_QUERY));
  }

  @Post("receipts")
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Idempotent()
  @Audited("stock.receive", "StockReceipt")
  receive(@Body() body: ReceiveStockDto, @CurrentUser() actor: Principal) {
    return this.stock.receive(body, actor);
  }

  @Post("adjustments")
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Idempotent()
  @Audited("stock.adjust", "StockAdjustment")
  adjust(@Body() body: AdjustStockDto, @CurrentUser() actor: Principal) {
    return this.stock.adjust(body, actor);
  }

  @Post("transfers")
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @Idempotent()
  @Audited("stock.transfer", "StockTransfer")
  transfer(@Body() body: TransferStockDto, @CurrentUser() actor: Principal) {
    return this.stock.transfer(body, actor);
  }
}
