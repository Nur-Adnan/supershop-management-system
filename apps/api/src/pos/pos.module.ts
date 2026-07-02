import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AccountingModule } from "../accounting/accounting.module";
import { CatalogModule } from "../catalog/catalog.module";
import { CountersModule } from "../counters/counters.module";
import { CustomersModule } from "../customers/customers.module";
import { InventoryModule } from "../inventory/inventory.module";
import { LoyaltyModule } from "../loyalty/loyalty.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { StoresModule } from "../stores/stores.module";
import { CashSessionsController } from "./cash-sessions.controller";
import { CashSessionRepository } from "./cash-session.repository";
import { CashSession, CashSessionSchema } from "./cash-session.schema";
import { CashSessionsService } from "./cash-sessions.service";
import { CashTransactionRepository } from "./cash-transaction.repository";
import { CashTransaction, CashTransactionSchema } from "./cash-transaction.schema";
import { PaymentRepository } from "./payment.repository";
import { Payment, PaymentSchema } from "./payment.schema";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { SaleReturnsController } from "./sale-returns.controller";
import { SaleReturnRepository } from "./sale-return.repository";
import { SaleReturn, SaleReturnSchema } from "./sale-return.schema";
import { SaleReturnsService } from "./sale-returns.service";
import { SalesController } from "./sales.controller";
import { SaleRepository } from "./sale.repository";
import { Sale, SaleSchema } from "./sale.schema";
import { SalesService } from "./sales.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashSession.name, schema: CashSessionSchema },
      { name: CashTransaction.name, schema: CashTransactionSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: SaleReturn.name, schema: SaleReturnSchema },
    ]),
    CountersModule,
    CatalogModule, // ProductsRepository
    StoresModule, // StoresRepository
    CustomersModule, // CustomersRepository
    InventoryModule, // StockService (postOutboundLine / postReceiptLine)
    AccountingModule, // JournalService + AccountRepository (sale/refund journal posting)
    PromotionsModule, // PromotionRepository (checkout code lookup/usage)
    LoyaltyModule, // LoyaltyService (checkout earn/redeem)
  ],
  controllers: [CashSessionsController, SalesController, SaleReturnsController, PaymentsController],
  providers: [
    CashSessionsService,
    CashSessionRepository,
    CashTransactionRepository,
    PaymentRepository,
    PaymentsService,
    SalesService,
    SaleRepository,
    SaleReturnsService,
    SaleReturnRepository,
  ],
  exports: [CashSessionsService, SalesService, SaleReturnsService, PaymentsService],
})
export class PosModule {}
