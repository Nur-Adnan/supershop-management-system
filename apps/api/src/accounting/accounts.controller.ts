import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { parsePageQuery } from "../common/query/parse-query";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto, UpdateAccountDto } from "./account.dto";

const ACCOUNT_QUERY = {
  filter: ["code", "type", "parentId", "isActive"],
  sort: ["code", "name", "createdAt"],
};

@ApiTags("accounting/accounts")
@ApiBearerAuth()
@Controller("accounting/accounts")
@RequirePermissions(PERMISSIONS.ACCOUNTING_READ)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.accounts.paginate(parsePageQuery(query, ACCOUNT_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.accounts.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Audited("account.create", "Account")
  create(@Body() body: CreateAccountDto, @CurrentUser() actor: Principal) {
    return this.accounts.create(body, actor);
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Audited("account.update", "Account")
  update(@Param("id") id: string, @Body() body: UpdateAccountDto, @CurrentUser() actor: Principal) {
    return this.accounts.update(id, body, actor);
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Audited("account.delete", "Account")
  remove(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.accounts.remove(id, actor);
  }
}
