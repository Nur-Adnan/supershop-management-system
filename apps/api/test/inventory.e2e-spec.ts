import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { ConfigModule } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Model } from "mongoose";
import { validateEnv } from "../src/config/env";
import { AuditModule } from "../src/audit/audit.module";
import { AuthModule } from "../src/auth/auth.module";
import { CatalogModule } from "../src/catalog/catalog.module";
import { CommonModule } from "../src/common/common.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { StockMovement } from "../src/inventory/stock-movement.schema";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { StoresModule } from "../src/stores/stores.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const money = (amount: number) => ({ amount, currency: "BDT" });

describe("Inventory & stock ledger (e2e)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let moveModel: Model<StockMovement>;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let admin: string;
  let cashier: string;

  let productId: string;
  let storeA: string;
  let storeB: string;

  async function sign(sub: string): Promise<string> {
    return new SignJWT({ email: `${sub}@test.com` })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject(sub)
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(key.privateKey);
  }
  async function seedUser(sub: string, roleName: string): Promise<void> {
    const role = await roleModel.findOne({ name: roleName }).lean();
    await userModel.create({
      supabaseId: sub,
      email: `${sub}@test.com`,
      roleId: role!._id,
      status: "active",
    });
  }

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const get = (url: string, t = admin) => app.inject({ method: "GET", url, headers: auth(t) });
  const post = (url: string, body: unknown, t = admin) =>
    app.inject({ method: "POST", url, headers: auth(t), payload: body as object });
  const postIdem = (url: string, body: unknown, k = randomUUID(), t = admin) =>
    app.inject({
      method: "POST",
      url,
      headers: { ...auth(t), "idempotency-key": k },
      payload: body as object,
    });

  async function levelAt(store: string): Promise<number> {
    const res = await get(`/inventory?productId=${productId}&storeId=${store}&limit=10`);
    const row = (res.json().data as Array<{ currentQty: number }>)[0];
    return row ? row.currentQty : 0;
  }
  async function batchesAt(store: string) {
    const res = await get(
      `/inventory/batches?productId=${productId}&storeId=${store}&sort=expiryDate&limit=50`,
    );
    return res.json().data as Array<{ qty: number; batchNo?: string; expiryDate: string | null }>;
  }

  beforeAll(async () => {
    key = await generateKeyPair("RS256", { extractable: true });
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_inventory_test?replicaSet=rs0";
    process.env.NODE_ENV = "test";
    process.env.SUPABASE_JWKS_URI = `http://127.0.0.1:${port}/jwks.json`;
    process.env.SUPABASE_JWT_ISSUER = ISSUER;
    process.env.SUPABASE_JWT_AUDIENCE = AUDIENCE;
    process.env.SUPABASE_WEBHOOK_SECRET = "whsec_test";
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
        CatalogModule,
        StoresModule,
        InventoryModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    moveModel = app.get<Model<StockMovement>>(getModelToken(StockMovement.name));
    await userModel.deleteMany({});
    await seedUser("u-admin", "super_admin");
    await seedUser("u-cashier", "cashier");
    admin = await sign("u-admin");
    cashier = await sign("u-cashier");

    // Master-data prerequisites.
    const unit = await post("/catalog/units", { name: "Piece", code: "pc" });
    const category = await post("/catalog/categories", { name: "Grocery" });
    const product = await post("/catalog/products", {
      sku: "SKU-INV",
      name: "Widget",
      categoryId: category.json().data.id,
      unitId: unit.json().data.id,
      pricing: { costPrice: money(1000), sellPrice: money(1500) },
    });
    productId = product.json().data.id;
    storeA = (await post("/stores", { name: "Store A", code: "STA" })).json().data.id;
    storeB = (await post("/stores", { name: "Store B", code: "STB" })).json().data.id;
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

  it("requires an Idempotency-Key on stock-creating endpoints", async () => {
    const res = await post("/inventory/receipts", {
      storeId: storeA,
      lines: [{ productId, qty: 1, costPrice: money(1000) }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("receives stock: creates a batch, a +RECEIPT movement, and bumps the cache", async () => {
    const res = await postIdem("/inventory/receipts", {
      storeId: storeA,
      lines: [
        {
          productId,
          qty: 10,
          costPrice: money(1000),
          batchNo: "B-LATE",
          expiryDate: "2027-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.number).toMatch(/^RCV-/);

    expect(await levelAt(storeA)).toBe(10);
    const batches = await batchesAt(storeA);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.qty).toBe(10);

    const moves = await get(
      `/inventory/movements?productId=${productId}&storeId=${storeA}&type=RECEIPT&limit=50`,
    );
    expect(moves.json().data[0].qty).toBe(10);
  });

  it("replays an identical receipt (same Idempotency-Key) without double-counting", async () => {
    const k = randomUUID();
    const body = { storeId: storeA, lines: [{ productId, qty: 3, costPrice: money(1000) }] };
    const first = await postIdem("/inventory/receipts", body, k);
    const before = await levelAt(storeA);
    const replay = await postIdem("/inventory/receipts", body, k);
    expect(replay.json().data.number).toBe(first.json().data.number);
    expect(await levelAt(storeA)).toBe(before); // not incremented again
  });

  it("decrements FEFO: soonest-expiry batch first across batches", async () => {
    // Second batch, earlier expiry, so FEFO must consume it first.
    await postIdem("/inventory/receipts", {
      storeId: storeA,
      lines: [
        {
          productId,
          qty: 5,
          costPrice: money(900),
          batchNo: "B-SOON",
          expiryDate: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const before = await levelAt(storeA);

    const adj = await postIdem("/inventory/adjustments", {
      storeId: storeA,
      reason: "wastage",
      lines: [{ productId, qty: -6 }],
    });
    expect(adj.statusCode).toBe(201);
    expect(await levelAt(storeA)).toBe(before - 6);

    // FEFO drains the earlier-expiry batch (B-SOON, 5) fully, then 1 from B-LATE (10 -> 9).
    // Assert by batchNo, not sort index: Mongo sorts the no-expiry batch first on ascending expiry.
    const batches = await batchesAt(storeA);
    expect(batches.find((b) => b.batchNo === "B-SOON")!.qty).toBe(0);
    expect(batches.find((b) => b.batchNo === "B-LATE")!.qty).toBe(9);
  });

  it("keeps the ledger the source of truth: Σ movements == cached currentQty", async () => {
    const moves = await get(
      `/inventory/movements?productId=${productId}&storeId=${storeA}&limit=200`,
    );
    const sum = (moves.json().data as Array<{ qty: number }>).reduce((a, m) => a + m.qty, 0);
    expect(sum).toBe(await levelAt(storeA));
  });

  it("rejects an over-issue with 409 INSUFFICIENT_STOCK and rolls back atomically", async () => {
    const before = await levelAt(storeA);
    const res = await postIdem("/inventory/adjustments", {
      storeId: storeA,
      reason: "impossible",
      lines: [{ productId, qty: -100000 }],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INSUFFICIENT_STOCK");
    expect(await levelAt(storeA)).toBe(before); // nothing changed
  });

  it("transfers stock between stores atomically, preserving lot identity", async () => {
    const fromBefore = await levelAt(storeA);
    const res = await postIdem("/inventory/transfers", {
      fromStoreId: storeA,
      toStoreId: storeB,
      lines: [{ productId, qty: 4 }],
    });
    expect(res.statusCode).toBe(201);
    expect(await levelAt(storeA)).toBe(fromBefore - 4);
    expect(await levelAt(storeB)).toBe(4);

    const inMove = await get(
      `/inventory/movements?productId=${productId}&storeId=${storeB}&type=TRANSFER_IN&limit=10`,
    );
    expect(inMove.json().data[0].qty).toBe(4);
  });

  it("rejects a same-store transfer (400) and an over-transfer (409)", async () => {
    const same = await postIdem("/inventory/transfers", {
      fromStoreId: storeA,
      toStoreId: storeA,
      lines: [{ productId, qty: 1 }],
    });
    expect(same.statusCode).toBe(400);

    const bBefore = await levelAt(storeB);
    const over = await postIdem("/inventory/transfers", {
      fromStoreId: storeB,
      toStoreId: storeA,
      lines: [{ productId, qty: 999 }],
    });
    expect(over.statusCode).toBe(409);
    expect(await levelAt(storeB)).toBe(bBefore); // atomic: destination unchanged
  });

  it("keeps stock_movements append-only (immutable)", async () => {
    const doc = await moveModel.findOne({ storeId: storeA }).lean();
    await expect(
      moveModel.updateOne({ _id: doc!._id }, { $set: { qty: 9999 } }).exec(),
    ).rejects.toThrow(/immutable/);
  });

  it("blocks a cashier (read-only inventory) from posting stock", async () => {
    const read = await get("/inventory", cashier);
    expect(read.statusCode).toBe(200);
    const write = await postIdem(
      "/inventory/receipts",
      { storeId: storeA, lines: [{ productId, qty: 1, costPrice: money(1000) }] },
      randomUUID(),
      cashier,
    );
    expect(write.statusCode).toBe(403);
  });
});
