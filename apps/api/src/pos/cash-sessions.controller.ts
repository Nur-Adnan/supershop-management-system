import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CashInOutDto, CloseCashSessionDto, OpenCashSessionDto } from "./cash-session.dto";
import { CashSessionsService } from "./cash-sessions.service";

const SESSION_QUERY = {
  filter: ["storeId", "terminalId", "status"],
  sort: ["createdAt", "status"],
};

@ApiTags("pos/cash-sessions")
@ApiBearerAuth()
@Controller("pos/cash-sessions")
@RequirePermissions(PERMISSIONS.POS_SESSION_MANAGE)
export class CashSessionsController {
  constructor(private readonly sessions: CashSessionsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.sessions.paginate(parsePageQuery(query, SESSION_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sessions.getOrThrow(id);
  }

  @Post()
  @Audited("cashSession.open", "CashSession")
  open(@Body() body: OpenCashSessionDto, @CurrentUser() actor: Principal) {
    return this.sessions.open(body, actor);
  }

  @Post(":id/close")
  @Audited("cashSession.close", "CashSession")
  close(
    @Param("id") id: string,
    @Body() body: CloseCashSessionDto,
    @CurrentUser() actor: Principal,
  ) {
    return this.sessions.close(id, body, actor);
  }

  @Post(":id/pay-in")
  @Idempotent()
  @Audited("cashSession.payIn", "CashSession")
  payIn(@Param("id") id: string, @Body() body: CashInOutDto, @CurrentUser() actor: Principal) {
    return this.sessions.payIn(id, body, actor);
  }

  @Post(":id/pay-out")
  @Idempotent()
  @Audited("cashSession.payOut", "CashSession")
  payOut(@Param("id") id: string, @Body() body: CashInOutDto, @CurrentUser() actor: Principal) {
    return this.sessions.payOut(id, body, actor);
  }
}
