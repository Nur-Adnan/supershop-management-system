import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateExpenseDto } from "./expense.dto";
import { ExpensesService } from "./expenses.service";

const EXPENSE_QUERY = { filter: ["accountId", "storeId", "paidVia"], sort: ["createdAt"] };

@ApiTags("accounting/expenses")
@ApiBearerAuth()
@Controller("accounting/expenses")
@RequirePermissions(PERMISSIONS.ACCOUNTING_READ)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.expenses.paginate(parsePageQuery(query, EXPENSE_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.expenses.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Idempotent()
  @Audited("expense.create", "Expense")
  create(@Body() body: CreateExpenseDto, @CurrentUser() actor: Principal) {
    return this.expenses.create(body, actor);
  }
}
