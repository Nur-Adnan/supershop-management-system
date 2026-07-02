import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateCustomerDto, UpdateCustomerDto } from "./customer.dto";
import { CustomersService } from "./customers.service";

const CUSTOMER_QUERY = { filter: ["phone", "groupId", "isActive"], sort: ["name", "createdAt"] };

@ApiTags("customers")
@ApiBearerAuth()
@Controller("customers")
@RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.customers.paginate(parsePageQuery(query, CUSTOMER_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.customers.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customer.create", "Customer")
  create(@Body() body: CreateCustomerDto, @CurrentUser() actor: Principal) {
    return this.customers.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customer.update", "Customer")
  update(
    @Param("id") id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.customers.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customer.delete", "Customer")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.customers.remove(id, actor);
  }
}
