import { Inject, Injectable } from "@nestjs/common";
import { type HealthIndicatorResult, HealthIndicatorService } from "@nestjs/terminus";
import type Redis from "ioredis";
import { REDIS } from "../redis/redis.module";

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong = await this.redis.ping();
      // Don't echo raw connection error text to (public) probe callers — status only.
      return pong === "PONG" ? indicator.up() : indicator.down();
    } catch {
      return indicator.down();
    }
  }
}
