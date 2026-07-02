import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Controller, Get, Param } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { type Model, Types } from "mongoose";
import { PERMISSIONS } from "@supershop/shared";
import { validateEnv } from "../src/config/env";
import { AuthModule } from "../src/auth/auth.module";
import { CurrentUser, RequirePermissions, StoreScope } from "../src/auth/decorators";
import type { Principal } from "../src/auth/principal";
import { AuditModule } from "../src/audit/audit.module";
import { CommonModule } from "../src/common/common.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const WEBHOOK_SECRET = "whsec_test_value";

// A store-scoped, permissioned endpoint just for this test.
@Controller("test")
class StoreTestController {
  @Get("stores/:storeId")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @StoreScope("params.storeId")
  read(@Param("storeId") storeId: string, @CurrentUser() user: Principal | undefined) {
    return { storeId, by: user?.roleName };
  }
}

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

describe("Auth & RBAC (e2e, local JWKS)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let key1: KeyPair;
  let key2: KeyPair;
  let jwksKeys: unknown[];

  const storeA = new Types.ObjectId().toString();
  const storeB = new Types.ObjectId().toString();

  async function sign(
    kp: KeyPair,
    kid: string,
    opts: { sub: string; exp?: number | string; issuer?: string; audience?: string },
  ): Promise<string> {
    return new SignJWT({ email: `${opts.sub}@test.com` })
      .setProtectedHeader({ alg: "RS256", kid })
      .setSubject(opts.sub)
      .setIssuedAt()
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setExpirationTime(opts.exp ?? "1h")
      .sign(kp.privateKey);
  }

  async function seedUser(sub: string, roleName: string, storeIds: string[] = []): Promise<void> {
    const role = await roleModel.findOne({ name: roleName }).lean();
    await userModel.create({
      supabaseId: sub,
      email: `${sub}@test.com`,
      roleId: role!._id,
      storeIds: storeIds.map((s) => new Types.ObjectId(s)),
      status: "active",
    });
  }

  function bearer(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    key1 = await generateKeyPair("RS256", { extractable: true });
    key2 = await generateKeyPair("RS256", { extractable: true });
    const jwk1 = { ...(await exportJWK(key1.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    jwksKeys = [jwk1];

    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: jwksKeys }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_auth_test?replicaSet=rs0";
    process.env.NODE_ENV = "test";
    process.env.SUPABASE_JWKS_URI = `http://127.0.0.1:${port}/jwks.json`;
    process.env.SUPABASE_JWT_ISSUER = ISSUER;
    process.env.SUPABASE_JWT_AUDIENCE = AUDIENCE;
    process.env.SUPABASE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.SUPABASE_JWKS_COOLDOWN_MS = "0"; // refetch immediately on unknown kid (rotation)
    process.env.AUTH_DEFAULT_ROLE = "cashier";

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        AuditModule,
        RolesModule,
        UsersModule,
        AuthModule,
        IdempotencyModule,
        CommonModule,
      ],
      controllers: [StoreTestController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));

    await userModel.deleteMany({});
    await seedUser("u-cashier", "cashier");
    await seedUser("u-admin", "super_admin");
    await seedUser("u-mgr", "store_manager", [storeA]);
    await seedUser("u-del", "super_admin");
  });

  afterAll(async () => {
    try {
      if (userModel) await userModel.db.dropDatabase();
      if (app) await app.close();
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("lazy-provisions a new user with the default role (login -> token -> /users/me)", async () => {
    const token = await sign(key1, "k1", { sub: "u-new" });
    const res = await app.inject({ method: "GET", url: "/users/me", headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.roleName).toBe("cashier");
    expect(await userModel.countDocuments({ supabaseId: "u-new" })).toBe(1);
  });

  it("denies without permission (403) and allows with it (200)", async () => {
    const cashier = await sign(key1, "k1", { sub: "u-cashier" });
    const admin = await sign(key1, "k1", { sub: "u-admin" });

    const denied = await app.inject({ method: "GET", url: "/users", headers: bearer(cashier) });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("FORBIDDEN");

    const allowed = await app.inject({ method: "GET", url: "/users", headers: bearer(admin) });
    expect(allowed.statusCode).toBe(200);
    expect(Array.isArray(allowed.json().data)).toBe(true);
  });

  it("enforces store scope (manager: own store ok, other 403; admin bypasses)", async () => {
    const mgr = await sign(key1, "k1", { sub: "u-mgr" });
    const admin = await sign(key1, "k1", { sub: "u-admin" });

    const own = await app.inject({
      method: "GET",
      url: `/test/stores/${storeA}`,
      headers: bearer(mgr),
    });
    expect(own.statusCode).toBe(200);

    const other = await app.inject({
      method: "GET",
      url: `/test/stores/${storeB}`,
      headers: bearer(mgr),
    });
    expect(other.statusCode).toBe(403);

    const asAdmin = await app.inject({
      method: "GET",
      url: `/test/stores/${storeB}`,
      headers: bearer(admin),
    });
    expect(asAdmin.statusCode).toBe(200);
  });

  it("paginates + sorts by allow-list and neutralizes query injection", async () => {
    const admin = await sign(key1, "k1", { sub: "u-admin" });

    const ok = await app.inject({
      method: "GET",
      url: "/users?sort=-email&limit=2",
      headers: bearer(admin),
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(typeof body.meta.total).toBe("number");

    // Non-allow-listed sort field -> rejected.
    const badSort = await app.inject({
      method: "GET",
      url: "/users?sort=supabaseId",
      headers: bearer(admin),
    });
    expect(badSort.statusCode).toBe(400);
    expect(badSort.json().error.code).toBe("VALIDATION_ERROR");

    // Injected operator key is parsed flat by Fastify and isn't allow-listed -> ignored, no injection.
    const injected = await app.inject({
      method: "GET",
      url: "/users?status[$ne]=disabled",
      headers: bearer(admin),
    });
    expect(injected.statusCode).toBe(200);

    // A malformed ObjectId in an allow-listed filter is a 400, not a 500.
    const badId = await app.inject({
      method: "GET",
      url: "/users?roleId=not-an-objectid",
      headers: bearer(admin),
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing, tampered, or expired token (401)", async () => {
    const noToken = await app.inject({ method: "GET", url: "/users/me" });
    expect(noToken.statusCode).toBe(401);

    const valid = await sign(key1, "k1", { sub: "u-admin" });
    const tampered = `${valid.slice(0, -3)}xyz`;
    const tamperedRes = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: bearer(tampered),
    });
    expect(tamperedRes.statusCode).toBe(401);

    const expired = await sign(key1, "k1", {
      sub: "u-admin",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const expiredRes = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: bearer(expired),
    });
    expect(expiredRes.statusCode).toBe(401);
  });

  it("handles JWKS key rotation (refetches on a new kid)", async () => {
    const jwk2 = { ...(await exportJWK(key2.publicKey)), kid: "k2", alg: "RS256", use: "sig" };
    jwksKeys = [
      { ...(await exportJWK(key1.publicKey)), kid: "k1", alg: "RS256", use: "sig" },
      jwk2,
    ];

    const rotated = await sign(key2, "k2", { sub: "u-admin" });
    const res = await app.inject({ method: "GET", url: "/users", headers: bearer(rotated) });
    expect(res.statusCode).toBe(200);
  });

  it("deactivates a profile on the Supabase delete webhook (then 403)", async () => {
    const ok = await app.inject({
      method: "POST",
      url: "/auth/webhook/supabase",
      headers: { "x-webhook-secret": WEBHOOK_SECRET },
      payload: { type: "DELETE", table: "users", old_record: { id: "u-del" } },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().data).toEqual({ received: true });

    const token = await sign(key1, "k1", { sub: "u-del" });
    const after = await app.inject({ method: "GET", url: "/users/me", headers: bearer(token) });
    expect(after.statusCode).toBe(403);

    // Soft-deleted user is excluded from admin listings.
    const admin = await sign(key1, "k1", { sub: "u-admin" });
    const list = await app.inject({
      method: "GET",
      url: "/users?limit=100",
      headers: bearer(admin),
    });
    const emails = (list.json().data as Array<{ email: string }>).map((u) => u.email);
    expect(emails).not.toContain("u-del@test.com");
  });

  it("rejects the webhook with a wrong secret (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/webhook/supabase",
      headers: { "x-webhook-secret": "wrong" },
      payload: { type: "DELETE", old_record: { id: "u-admin" } },
    });
    expect(res.statusCode).toBe(401);
  });
});
