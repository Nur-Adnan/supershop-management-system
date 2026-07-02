import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { RequirePermissions } from "../auth/decorators";
import { parsePageQuery } from "../common/query/parse-query";
import { LoyaltyService } from "./loyalty.service";

const LOYALTY_QUERY = { filter: ["customerId", "type", "refType", "refId"], sort: ["createdAt"] };

@ApiTags("loyalty")
@ApiBearerAuth()
@Controller("loyalty/transactions")
@RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.loyalty.paginate(parsePageQuery(query, LOYALTY_QUERY));
  }
}
