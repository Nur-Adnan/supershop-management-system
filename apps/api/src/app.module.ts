import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { validateEnv, type Env } from "./config/env";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get("MONGODB_URI", { infer: true }),
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    }),
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
