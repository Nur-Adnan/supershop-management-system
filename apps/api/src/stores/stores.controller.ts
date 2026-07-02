import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateStoreDto, UpdateStoreDto } from "./store.dto";
import { StoresService } from "./stores.service";

const STORE_QUERY = {
  filter: ["code", "currency", "isActive"],
  sort: ["code", "name", "createdAt"],
};

@ApiTags("stores")
@ApiBearerAuth()
@Controller("stores")
@RequirePermissions(PERMISSIONS.STORES_READ)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.stores.paginate(parsePageQuery(query, STORE_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.stores.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STORES_MANAGE)
  @Audited("store.create", "Store")
  create(@Body() body: CreateStoreDto, @CurrentUser() actor: Principal) {
    return this.stores.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.STORES_MANAGE)
  @Audited("store.update", "Store")
  update(@Param("id") id: string, @Body() body: UpdateStoreDto, @CurrentUser() actor: Principal) {
    return this.stores.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.STORES_MANAGE)
  @Audited("store.delete", "Store")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.stores.remove(id, actor);
  }
}
