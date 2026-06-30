import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Counter, CounterSchema } from "./counter.schema";
import { CountersService } from "./counters.service";

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }])],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
