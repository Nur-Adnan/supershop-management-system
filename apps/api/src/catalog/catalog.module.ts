import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { BrandsController } from "./brands.controller";
import { BrandsRepository } from "./brand.repository";
import { Brand, BrandSchema } from "./brand.schema";
import { BrandsService } from "./brands.service";
import { CategoriesController } from "./categories.controller";
import { CategoriesRepository } from "./category.repository";
import { Category, CategorySchema } from "./category.schema";
import { CategoriesService } from "./categories.service";
import { ProductsController } from "./products.controller";
import { ProductsRepository } from "./product.repository";
import { Product, ProductSchema } from "./product.schema";
import { ProductsService } from "./products.service";
import { UnitsController } from "./units.controller";
import { UnitsRepository } from "./unit.repository";
import { Unit, UnitSchema } from "./unit.schema";
import { UnitsService } from "./units.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Unit.name, schema: UnitSchema },
      { name: Brand.name, schema: BrandSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [UnitsController, BrandsController, CategoriesController, ProductsController],
  providers: [
    UnitsService,
    UnitsRepository,
    BrandsService,
    BrandsRepository,
    CategoriesService,
    CategoriesRepository,
    ProductsService,
    ProductsRepository,
  ],
  exports: [
    UnitsService,
    BrandsService,
    CategoriesService,
    CategoriesRepository,
    ProductsService,
    ProductsRepository,
  ],
})
export class CatalogModule {}
