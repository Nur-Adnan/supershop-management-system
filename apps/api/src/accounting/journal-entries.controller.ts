import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "@supershop/shared";
import { Audited } from "../audit/audited.decorator";
import { CurrentUser, RequirePermissions } from "../auth/decorators";
import type { Principal } from "../auth/principal";
import { Idempotent } from "../idempotency/idempotent.decorator";
import { parsePageQuery } from "../common/query/parse-query";
import { CreateJournalEntryDto } from "./journal-entry.dto";
import { JournalService } from "./journal.service";

const ENTRY_QUERY = { filter: ["refType", "refId"], sort: ["date", "createdAt", "number"] };

@ApiTags("accounting/journal-entries")
@ApiBearerAuth()
@Controller("accounting/journal-entries")
@RequirePermissions(PERMISSIONS.ACCOUNTING_READ)
export class JournalEntriesController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.journal.paginate(parsePageQuery(query, ENTRY_QUERY));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.journal.getOrThrow(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Idempotent()
  @Audited("journalEntry.create", "JournalEntry")
  create(@Body() body: CreateJournalEntryDto, @CurrentUser() actor: Principal) {
    return this.journal.createManual(body, actor);
  }

  @Post(":id/reverse")
  @RequirePermissions(PERMISSIONS.ACCOUNTING_POST)
  @Idempotent()
  @Audited("journalEntry.reverse", "JournalEntry")
  reverse(@Param("id") id: string, @CurrentUser() actor: Principal) {
    return this.journal.reverse(id, actor);
  }
}
