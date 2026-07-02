import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { RequirePermissions } from "../auth/decorators";
import { parsePageQuery } from "../common/query/parse-query";
import { PaymentsService } from "./payments.service";

const PAYMENT_QUERY = {
  filter: ["direction", "method", "refType", "refId", "storeId", "customerId"],
  sort: ["createdAt", "amount"],
};

@ApiTags("pos/payments")
@ApiBearerAuth()
@Controller("pos/payments")
@RequirePermissions(PERMISSIONS.SALES_READ)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.payments.paginate(parsePageQuery(query, PAYMENT_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.payments.getOrThrow(id);
  }
}
