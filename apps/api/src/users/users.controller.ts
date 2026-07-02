import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { AssignRoleDto, AssignStoresDto, SetStatusDto } from "./user.dto";
import { UsersService } from "./users.service";

const USER_QUERY = {
  filter: ["email", "status", "roleId"],
  sort: ["email", "createdAt", "status"],
};

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Any authenticated user can read their own profile (overrides the class permission). */
  @Get("me")
  @RequirePermissions()
  me(@CurrentUser() principal: Principal | undefined) {
    return principal;
  }

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.users.paginate(parsePageQuery(query, USER_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.getOrThrow(id);
  }

  @Post(":id/role")
  assignRole(
    @Param("id") id: string,
    @Body() body: AssignRoleDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.users.assignRole(id, body.roleId, actor);
  }

  @Post(":id/stores")
  assignStores(
    @Param("id") id: string,
    @Body() body: AssignStoresDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.users.assignStores(id, body.storeIds, actor);
  }

  @Post(":id/status")
  setStatus(@Param("id") id: string, @Body() body: SetStatusDto, @CurrentUser() actor: Principal) {
    return this.users.setStatus(id, body.status, actor);
  }
}
