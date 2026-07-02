import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CustomerGroupsService } from "./customer-groups.service";
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from "./customer-group.dto";

const GROUP_QUERY = { filter: ["name", "isActive"], sort: ["name", "createdAt"] };

@ApiTags("customer-groups")
@ApiBearerAuth()
@Controller("customer-groups")
@RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
export class CustomerGroupsController {
  constructor(private readonly groups: CustomerGroupsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.groups.paginate(parsePageQuery(query, GROUP_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.groups.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customerGroup.create", "CustomerGroup")
  create(@Body() body: CreateCustomerGroupDto, @CurrentUser() actor: Principal) {
    return this.groups.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customerGroup.update", "CustomerGroup")
  update(
    @Param("id") id: string,
    @Body() body: UpdateCustomerGroupDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.groups.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_MANAGE)
  @Audited("customerGroup.delete", "CustomerGroup")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.groups.remove(id, actor);
  }
}
