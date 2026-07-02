import "reflect-metadata";
import helmet from "@fastify/helmet";
import { RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { sanitizeMongo } from "./common/security/sanitize-mongo";
import type { Env } from "./config/env";

function resolveTrustProxy(raw: string | undefined): boolean | string | number {
  if (!raw) return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  return Number.isInteger(n) && String(n) === raw ? n : raw;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1_048_576, // 1 MB
      trustProxy: resolveTrustProxy(process.env.TRUSTED_PROXIES),
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Security headers (CSP disabled so the dev Swagger UI loads; tighten per-route in prod).
  await app.register(helmet, { contentSecurityPolicy: false });

  app.enableCors({
    origin: config
      .get("CORS_ORIGINS", { infer: true })
      .split(",")
      .map((o) => o.trim()),
    credentials: true,
  });

  // Strip Mongo operator/dotted keys from bodies before guards/pipes (defense in depth).
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("preHandler", (req, _reply, done) => {
      if (req.body && typeof req.body === "object") req.body = sanitizeMongo(req.body);
      done();
    });

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  if (config.get("NODE_ENV", { infer: true }) !== "production") {
    const docConfig = new DocumentBuilder()
      .setTitle("Supershop API")
      .setDescription("Supershop Management System API")
      .setVersion("1")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, docConfig));
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API on http://localhost:${port} (health: /health/live, docs: /api/docs)`);
}

void bootstrap();
