import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CustomersModule } from "../customers/customers.module";
import { LoyaltyTransaction, LoyaltyTransactionSchema } from "./loyalty-transaction.schema";
import { LoyaltyTransactionRepository } from "./loyalty-transaction.repository";
import { LoyaltyController } from "./loyalty.controller";
import { LoyaltyService } from "./loyalty.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
    ]),
    CustomersModule, // CustomersRepository (balance read/update)
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyTransactionRepository],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
