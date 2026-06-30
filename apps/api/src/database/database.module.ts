import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import type { Env } from "../config/env";
import { TransactionService } from "./transaction.service";

/**
 * Owns the Mongoose connection (pooled, retrying) and the transaction helper.
 * Graceful shutdown is handled by app.enableShutdownHooks() closing the connection.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get("MONGODB_URI", { infer: true }),
        retryAttempts: 5,
        retryDelay: 2000,
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      }),
    }),
  ],
  providers: [TransactionService],
  exports: [TransactionService, MongooseModule],
})
export class DatabaseModule {}
