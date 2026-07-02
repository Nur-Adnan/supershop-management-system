import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateGoodsReceiptDto } from "./goods-receipt.dto";
import { GoodsReceiptsService } from "./goods-receipts.service";

const GRN_QUERY = { filter: ["poId", "supplierId", "storeId"], sort: ["createdAt", "number"] };

@ApiTags("purchasing/receipts")
@ApiBearerAuth()
@Controller("purchasing/receipts")
@RequirePermissions(PERMISSIONS.PURCHASING_READ)
export class GoodsReceiptsController {
  constructor(private readonly receipts: GoodsReceiptsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.receipts.paginate(parsePageQuery(query, GRN_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.receipts.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASING_MANAGE)
  @Idempotent()
  @Audited("goodsReceipt.create", "GoodsReceipt")
  create(@Body() body: CreateGoodsReceiptDto, @CurrentUser() actor: Principal) {
    return this.receipts.create(body, actor);
  }
}
