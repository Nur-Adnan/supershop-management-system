import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { StoresController } from "./stores.controller";
import { StoresRepository } from "./store.repository";
import { Store, StoreSchema } from "./store.schema";
import { StoresService } from "./stores.service";

@Module({
  imports: [MongooseModule.forFeature([{ name: Store.name, schema: StoreSchema }])],
  controllers: [StoresController],
  providers: [StoresService, StoresRepository],
  exports: [StoresService, StoresRepository],
})
export class StoresModule {}
