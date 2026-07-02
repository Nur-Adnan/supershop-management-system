import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersRepository } from "./supplier.repository";
import { Supplier, SupplierSchema } from "./supplier.schema";
import { SuppliersService } from "./suppliers.service";

@Module({
  imports: [MongooseModule.forFeature([{ name: Supplier.name, schema: SupplierSchema }])],
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersRepository],
  exports: [SuppliersService, SuppliersRepository],
})
export class SuppliersModule {}
