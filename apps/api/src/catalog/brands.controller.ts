import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { BrandsService } from "./brands.service";
import { CreateBrandDto, UpdateBrandDto } from "./brand.dto";

const BRAND_QUERY = { filter: ["name", "isActive"], sort: ["name", "createdAt"] };

@ApiTags("catalog/brands")
@ApiBearerAuth()
@Controller("catalog/brands")
@RequirePermissions(PERMISSIONS.CATALOG_READ)
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.brands.paginate(parsePageQuery(query, BRAND_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.brands.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("brand.create", "Brand")
  create(@Body() body: CreateBrandDto, @CurrentUser() actor: Principal) {
    return this.brands.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("brand.update", "Brand")
  update(@Param("id") id: string, @Body() body: UpdateBrandDto, @CurrentUser() actor: Principal) {
    return this.brands.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("brand.delete", "Brand")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.brands.remove(id, actor);
  }
}
