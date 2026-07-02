import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateSupplierDto, UpdateSupplierDto } from "./supplier.dto";
import { SuppliersService } from "./suppliers.service";

const SUPPLIER_QUERY = { filter: ["code", "isActive"], sort: ["name", "code", "createdAt"] };

@ApiTags("suppliers")
@ApiBearerAuth()
@Controller("suppliers")
@RequirePermissions(PERMISSIONS.SUPPLIERS_READ)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.suppliers.paginate(parsePageQuery(query, SUPPLIER_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.suppliers.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited("supplier.create", "Supplier")
  create(@Body() body: CreateSupplierDto, @CurrentUser() actor: Principal) {
    return this.suppliers.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited("supplier.update", "Supplier")
  update(
    @Param("id") id: string,
    @Body() body: UpdateSupplierDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.suppliers.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  @Audited("supplier.delete", "Supplier")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.suppliers.remove(id, actor);
  }
}
