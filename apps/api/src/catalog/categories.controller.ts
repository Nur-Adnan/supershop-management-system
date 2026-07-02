import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./category.dto";

const CATEGORY_QUERY = { filter: ["parentId", "isActive"], sort: ["name", "createdAt"] };

@ApiTags("catalog/categories")
@ApiBearerAuth()
@Controller("catalog/categories")
@RequirePermissions(PERMISSIONS.CATALOG_READ)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.categories.paginate(parsePageQuery(query, CATEGORY_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.categories.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("category.create", "Category")
  create(@Body() body: CreateCategoryDto, @CurrentUser() actor: Principal) {
    return this.categories.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("category.update", "Category")
  update(
    @Param("id") id: string,
    @Body() body: UpdateCategoryDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.categories.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("category.delete", "Category")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.categories.remove(id, actor);
  }
}
