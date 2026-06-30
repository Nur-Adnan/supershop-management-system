import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env";
import { CommonModule } from "./common/common.module";
import { DatabaseModule } from "./database/database.module";
import { CountersModule } from "./counters/counters.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    CountersModule,
    IdempotencyModule,
    CommonModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
