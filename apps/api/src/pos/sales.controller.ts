import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CheckoutDto } from "./sale.dto";
import { SalesService } from "./sales.service";

const SALE_QUERY = {
  filter: ["storeId", "customerId", "cashSessionId", "status"],
  sort: ["createdAt", "number", "total"],
};

@ApiTags("pos/sales")
@ApiBearerAuth()
@Controller("pos/sales")
@RequirePermissions(PERMISSIONS.SALES_READ)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.sales.paginate(parsePageQuery(query, SALE_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sales.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.POS_SELL)
  @Idempotent()
  @Audited("sale.checkout", "Sale")
  checkout(@Body() body: CheckoutDto, @CurrentUser() actor: Principal) {
    return this.sales.checkout(body, actor);
  }
}
