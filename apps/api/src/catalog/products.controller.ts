import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateProductDto, ProductBulkDto, UpdateProductDto } from "./product.dto";
import { ProductsService } from "./products.service";

const PRODUCT_QUERY = {
  filter: ["sku", "categoryId", "brandId", "unitId", "isActive", "isWeighted"],
  sort: ["sku", "name", "createdAt", "reorderLevel"],
};

@ApiTags("catalog/products")
@ApiBearerAuth()
@Controller("catalog/products")
@RequirePermissions(PERMISSIONS.CATALOG_READ)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.products.paginate(parsePageQuery(query, PRODUCT_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.products.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("product.create", "Product")
  create(@Body() body: CreateProductDto, @CurrentUser() actor: Principal) {
    return this.products.create(body, actor);
  }

  /** Bulk upsert products by SKU with a per-row result report. */
  @Post("bulk")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("product.bulkImport", "Product")
  bulk(@Body() body: ProductBulkDto, @CurrentUser() actor: Principal) {
    return this.products.bulkImport(body.rows, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("product.update", "Product")
  update(@Param("id") id: string, @Body() body: UpdateProductDto, @CurrentUser() actor: Principal) {
    return this.products.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.CATALOG_MANAGE)
  @Audited("product.delete", "Product")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.products.remove(id, actor);
  }
}
