import { Controller, Get } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { Throttle } from "@nestjs/throttler";
import type Redis from "ioredis";
import { validateEnv } from "../src/config/env";
import { REDIS, RedisModule } from "../src/redis/redis.module";
import { ThrottlingModule } from "../src/throttling/throttling.module";

@Controller("t")
class ThrottleTestController {
  @Get("ping")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  ping() {
    return { ok: true };
  }
}

describe("Throttling (e2e, Redis-backed)", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_throttle_test?replicaSet=rs0";
    process.env.REDIS_URL = "redis://localhost:6379";

    const ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        RedisModule,
        ThrottlingModule,
      ],
      controllers: [ThrottleTestController],
    }).compile();

    app = ref.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.get<Redis>(REDIS).flushall(); // start from a clean rate-limit window
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 429 after the per-route limit is exceeded", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "GET", url: "/t/ping" });
      codes.push(res.statusCode);
    }
    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes).toContain(429);
  });
});
