import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateUnitDto, UpdateUnitDto } from "./unit.dto";
import { UnitsService } from "./units.service";

const UNIT_QUERY = { filter: ["code", "isActive"], sort: ["code", "name", "createdAt"] };

@ApiTags("catalog/units")
@ApiBearerAuth()
@Controller("catalog/units")
@RequirePermissions(PERMISSIONS.CATALOG_READ)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.units.paginate(parsePageQuery(query, UNIT_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.units.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("unit.create", "Unit")
  create(@Body() body: CreateUnitDto, @CurrentUser() actor: Principal) {
    return this.units.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("unit.update", "Unit")
  update(@Param("id") id: string, @Body() body: UpdateUnitDto, @CurrentUser() actor: Principal) {
    return this.units.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("unit.delete", "Unit")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.units.remove(id, actor);
  }
}
