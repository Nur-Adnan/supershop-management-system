import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import type { Env } from "../config/env";
import { UsersService } from "../users/users.service";
import { SupabaseWebhookDto } from "./auth-webhook.dto";
import { Public } from "./decorators";

@Controller("auth/webhook")
export class AuthWebhookController {
  private readonly secret?: string;

  constructor(
    private readonly users: UsersService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get("SUPABASE_WEBHOOK_SECRET", { infer: true });
  }

  /** Public (Supabase has no user JWT) but authenticated by a shared secret header. */
  @Public()
  @Post("supabase")
  async handle(
    @Headers("x-webhook-secret") provided: string | undefined,
    @Body() payload: SupabaseWebhookDto,
  ): Promise<{ received: true }> {
    this.verifySecret(provided);

    if (payload.type === "DELETE") {
      const id = payload.old_record?.id ?? payload.record?.id;
      if (id) await this.users.deactivateBySupabaseId(id);
    } else if (payload.record?.id && payload.record.email) {
      await this.users.upsertFromAuthEvent(payload.record.id, payload.record.email);
    }
    return { received: true };
  }

  private verifySecret(provided: string | undefined): void {
    if (!this.secret) {
      throw new DomainException(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Webhook secret not configured",
        503,
      );
    }
    const a = Buffer.from(provided ?? "");
    const b = Buffer.from(this.secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new DomainException(ErrorCode.UNAUTHORIZED, "Invalid webhook secret", 401);
    }
  }
}
