import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateSaleReturnDto } from "./sale-return.dto";
import { SaleReturnsService } from "./sale-returns.service";

const RETURN_QUERY = { filter: ["saleId", "storeId", "customerId"], sort: ["createdAt", "number"] };

@ApiTags("pos/sale-returns")
@ApiBearerAuth()
@Controller("pos/sale-returns")
@RequirePermissions(PERMISSIONS.SALES_READ)
export class SaleReturnsController {
  constructor(private readonly returns: SaleReturnsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.returns.paginate(parsePageQuery(query, RETURN_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.returns.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.POS_REFUND)
  @Idempotent()
  @Audited("saleReturn.create", "SaleReturn")
  create(@Body() body: CreateSaleReturnDto, @CurrentUser() actor: Principal) {
    return this.returns.refund(body, actor);
  }
}
