import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { RequirePermissions } from "../auth/decorators";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateRoleDto, UpdateRoleDto } from "./role.dto";
import { RolesService } from "./roles.service";

const ROLE_QUERY = { filter: ["name", "isSystem"], sort: ["name", "createdAt", "isSystem"] };

@ApiTags("roles")
@ApiBearerAuth()
@Controller("roles")
@RequirePermissions(PERMISSIONS.ROLES_MANAGE)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.roles.paginate(parsePageQuery(query, ROLE_QUERY));
  }

  @Post()
  create(@Body() body: CreateRoleDto) {
    return this.roles.create(body);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.roles.getOrThrow(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateRoleDto) {
    return this.roles.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.roles.remove(id);
  }
}
