import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { CreatePromotionDto, UpdatePromotionDto } from "./promotion.dto";
import { PromotionsService } from "./promotions.service";

const PROMOTION_QUERY = {
  filter: ["code", "type", "isActive"],
  sort: ["code", "validFrom", "createdAt"],
};

@ApiTags("promotions")
@ApiBearerAuth()
@Controller("promotions")
@RequirePermissions(PERMISSIONS.PROMOTIONS_READ)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.promotions.paginate(parsePageQuery(query, PROMOTION_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.promotions.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE)
  @Audited("promotion.create", "Promotion")
  create(@Body() body: CreatePromotionDto, @CurrentUser() actor: Principal) {
    return this.promotions.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE)
  @Audited("promotion.update", "Promotion")
  update(
    @Param("id") id: string,
    @Body() body: UpdatePromotionDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.promotions.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.PROMOTIONS_MANAGE)
  @Audited("promotion.delete", "Promotion")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.promotions.remove(id, actor);
  }
}
