import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongo: Connection,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: process is up. Must not depend on external services. */
  @Get("live")
  live(): { status: "ok"; uptime: number } {
    return { status: "ok", uptime: process.uptime() };
  }

  /** Readiness: can we actually serve traffic (Mongo + Redis reachable)? */
  @Get("ready")
  async ready(): Promise<{ status: "ok"; checks: { mongo: boolean; redis: boolean } }> {
    const mongo = this.mongo.readyState === 1;
    let redis: boolean;
    try {
      redis = (await this.redis.ping()) === "PONG";
    } catch {
      redis = false;
    }
    const checks = { mongo, redis };
    if (!mongo || !redis) {
      throw new ServiceUnavailableException({ status: "degraded", checks });
    }
    return { status: "ok", checks };
  }
}
