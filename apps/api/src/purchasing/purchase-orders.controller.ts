import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from "./purchase-order.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

const PO_QUERY = {
  filter: ["supplierId", "storeId", "status"],
  sort: ["createdAt", "number", "status"],
};

@ApiTags("purchasing/orders")
@ApiBearerAuth()
@Controller("purchasing/orders")
@RequirePermissions(PERMISSIONS.PURCHASING_READ)
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.orders.paginate(parsePageQuery(query, PO_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.orders.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASING_MANAGE)
  @Audited("purchaseOrder.create", "PurchaseOrder")
  create(@Body() body: CreatePurchaseOrderDto, @CurrentUser() actor: Principal) {
    return this.orders.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PURCHASING_MANAGE)
  @Audited("purchaseOrder.update", "PurchaseOrder")
  update(
    @Param("id") id: string,
    @Body() body: UpdatePurchaseOrderDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.orders.update(id, body, actor);
  }

  @Post(":id/approve")
  @RequirePermissions(PERMISSIONS.PURCHASING_APPROVE)
  @Audited("purchaseOrder.approve", "PurchaseOrder")
  approve(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.orders.approve(id, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.PURCHASING_MANAGE)
  @Audited("purchaseOrder.cancel", "PurchaseOrder")
  cancel(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.orders.cancel(id, actor);
  }
}
