import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CountersModule } from "../counters/counters.module";
import { StoresModule } from "../stores/stores.module";
import { AccountRepository } from "./account.repository";
import { Account, AccountSchema } from "./account.schema";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";
import { ExpenseRepository } from "./expense.repository";
import { Expense, ExpenseSchema } from "./expense.schema";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";
import { JournalEntriesController } from "./journal-entries.controller";
import { JournalEntryRepository } from "./journal-entry.repository";
import { JournalEntry, JournalEntrySchema } from "./journal-entry.schema";
import { JournalService } from "./journal.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Expense.name, schema: ExpenseSchema },
    ]),
    CountersModule,
    StoresModule, // StoresRepository (expense store ref validation)
  ],
  controllers: [AccountsController, JournalEntriesController, ExpensesController],
  providers: [
    AccountsService,
    AccountRepository,
    JournalService,
    JournalEntryRepository,
    ExpensesService,
    ExpenseRepository,
  ],
  exports: [AccountsService, JournalService, ExpensesService, AccountRepository],
})
export class AccountingModule {}
