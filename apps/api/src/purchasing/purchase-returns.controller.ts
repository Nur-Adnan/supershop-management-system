import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CreatePurchaseReturnDto } from "./purchase-return.dto";
import { PurchaseReturnsService } from "./purchase-returns.service";

const RETURN_QUERY = { filter: ["supplierId", "storeId", "grnId"], sort: ["createdAt", "number"] };

@ApiTags("purchasing/returns")
@ApiBearerAuth()
@Controller("purchasing/returns")
@RequirePermissions(PERMISSIONS.PURCHASING_READ)
export class PurchaseReturnsController {
  constructor(private readonly returns: PurchaseReturnsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.returns.paginate(parsePageQuery(query, RETURN_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.returns.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASING_MANAGE)
  @Idempotent()
  @Audited("purchaseReturn.create", "PurchaseReturn")
  create(@Body() body: CreatePurchaseReturnDto, @CurrentUser() actor: Principal) {
    return this.returns.create(body, actor);
  }
}
