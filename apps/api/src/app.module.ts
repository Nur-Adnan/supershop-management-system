import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv, type Env } from "./config/env";
import { AccountingModule } from "./accounting/accounting.module";
import { AuditModule } from "./audit/audit.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CommonModule } from "./common/common.module";
import { CustomersModule } from "./customers/customers.module";
import { InventoryModule } from "./inventory/inventory.module";
import { DatabaseModule } from "./database/database.module";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { PosModule } from "./pos/pos.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { PurchasingModule } from "./purchasing/purchasing.module";
import { CountersModule } from "./counters/counters.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";
import { RolesModule } from "./roles/roles.module";
import { StoresModule } from "./stores/stores.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { UsersModule } from "./users/users.module";
import { ThrottlingModule } from "./throttling/throttling.module";
import { AuthModule } from "./auth/auth.module";
import { RedisModule } from "./redis/redis.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          genReqId: (req) =>
            typeof req.headers["x-request-id"] === "string"
              ? req.headers["x-request-id"]
              : randomUUID(),
          customProps: (req) => ({ reqId: req.id }),
          // Never log credentials.
          redact: {
            paths: [
              "req.headers.authorization",
              'req.headers["x-webhook-secret"]',
              "req.headers.cookie",
            ],
            remove: true,
          },
          autoLogging: true,
        },
      }),
    }),
    RedisModule,
    DatabaseModule,
    AuditModule,
    CountersModule,
    IdempotencyModule,
    RolesModule,
    UsersModule,
    // Master data (Phase 4).
    CatalogModule,
    StoresModule,
    SuppliersModule,
    CustomersModule,
    AccountingModule,
    InventoryModule,
    PurchasingModule,
    PromotionsModule,
    LoyaltyModule,
    PosModule,
    // Throttling guard registers before Auth's guards so bursts are rejected first.
    ThrottlingModule,
    AuthModule,
    CommonModule,
    HealthModule,
  ],
})
export class AppModule {}
