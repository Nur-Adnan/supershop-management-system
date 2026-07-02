import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CatalogModule } from "../catalog/catalog.module";
import { CustomersModule } from "../customers/customers.module";
import { Promotion, PromotionSchema } from "./promotion.schema";
import { PromotionRepository } from "./promotion.repository";
import { PromotionsController } from "./promotions.controller";
import { PromotionsService } from "./promotions.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Promotion.name, schema: PromotionSchema }]),
    CatalogModule, // ProductsRepository/CategoriesRepository (ref validation)
    CustomersModule, // CustomerGroupsRepository (ref validation)
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionRepository],
  exports: [PromotionsService, PromotionRepository],
})
export class PromotionsModule {}
