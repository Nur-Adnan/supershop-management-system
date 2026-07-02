import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthWebhookController } from "./auth-webhook.controller";
import { AuthGuard } from "./auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import { StoreScopeGuard } from "./store-scope.guard";
import { SupabaseJwtService } from "./supabase-jwt.service";

/**
 * Global guard chain (runs in this order): authenticate -> check permissions -> check
 * store scope. RolesModule/UsersModule are @Global, so the guards resolve their services.
 */
@Module({
  controllers: [AuthWebhookController],
  providers: [
    SupabaseJwtService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: StoreScopeGuard },
  ],
  exports: [SupabaseJwtService],
})
export class AuthModule {}
