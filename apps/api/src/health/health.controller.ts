import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/decorators";
import { RedisHealthIndicator } from "./redis.health";

@ApiTags("health")
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  /** Liveness: the process is up. Must not depend on external services. */
  @Get("live")
  live(): { status: "ok"; uptime: number } {
    return { status: "ok", uptime: process.uptime() };
  }

  /** Readiness: can we serve traffic — Mongo + Redis reachable. */
  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.mongoose.pingCheck("mongodb"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
