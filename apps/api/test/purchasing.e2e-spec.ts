import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { ConfigModule } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Model } from "mongoose";
import { PERMISSIONS } from "@supershop/shared";
import { validateEnv } from "../src/config/env";
import { AuditModule } from "../src/audit/audit.module";
import { AuthModule } from "../src/auth/auth.module";
import { CatalogModule } from "../src/catalog/catalog.module";
import { CommonModule } from "../src/common/common.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { PurchasingModule } from "../src/purchasing/purchasing.module";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { StoresModule } from "../src/stores/stores.module";
import { SuppliersModule } from "../src/suppliers/suppliers.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const money = (amount: number) => ({ amount, currency: "BDT" });

describe("Purchasing (e2e — PO -> GRN -> purchase returns)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let admin: string;
  let creator: string; // PURCHASING_MANAGE only (no APPROVE)
  let reader: string; // PURCHASING_READ only

  let supplierId: string;
  let storeId: string;
  let productAId: string;
  let productBId: string;

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
  async function seedUserWithRoleName(sub: string, roleName: string): Promise<void> {
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
  const patch = (url: string, body: unknown, t = admin) =>
    app.inject({ method: "PATCH", url, headers: auth(t), payload: body as object });
  const del = (url: string, t = admin) => app.inject({ method: "DELETE", url, headers: auth(t) });
  const postIdem = (url: string, body: unknown, k = randomUUID(), t = admin) =>
    app.inject({
      method: "POST",
      url,
      headers: { ...auth(t), "idempotency-key": k },
      payload: body as object,
    });

  async function levelAt(productId: string): Promise<number> {
    const res = await get(`/inventory?productId=${productId}&storeId=${storeId}&limit=10`);
    const row = (res.json().data as Array<{ currentQty: number }>)[0];
    return row ? row.currentQty : 0;
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

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_purchasing_test?replicaSet=rs0";
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
        SuppliersModule,
        InventoryModule,
        PurchasingModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    await userModel.deleteMany({});

    // Custom roles to test maker-checker segregation: no seeded SYSTEM_ROLE separates
    // PURCHASING_MANAGE from PURCHASING_APPROVE (store_manager has both).
    await roleModel.create({
      name: "po_creator_test",
      permissions: [
        PERMISSIONS.PURCHASING_READ,
        PERMISSIONS.PURCHASING_MANAGE,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.STORES_READ,
        PERMISSIONS.SUPPLIERS_READ,
        PERMISSIONS.CATALOG_READ,
      ],
      isSystem: false,
    });
    await roleModel.create({
      name: "po_reader_test",
      permissions: [PERMISSIONS.PURCHASING_READ],
      isSystem: false,
    });

    await seedUserWithRoleName("u-admin", "super_admin");
    await seedUserWithRoleName("u-creator", "po_creator_test");
    await seedUserWithRoleName("u-reader", "po_reader_test");
    admin = await sign("u-admin");
    creator = await sign("u-creator");
    reader = await sign("u-reader");

    // Master-data prerequisites (as admin).
    const unit = await post("/catalog/units", { name: "Piece", code: "pc" });
    const category = await post("/catalog/categories", { name: "Grocery" });
    const unitId = unit.json().data.id;
    const categoryId = category.json().data.id;
    productAId = (
      await post("/catalog/products", {
        sku: "SKU-PUR-A",
        name: "Product A",
        categoryId,
        unitId,
        pricing: { costPrice: money(400), sellPrice: money(600) },
      })
    ).json().data.id;
    productBId = (
      await post("/catalog/products", {
        sku: "SKU-PUR-B",
        name: "Product B",
        categoryId,
        unitId,
        pricing: { costPrice: money(300), sellPrice: money(450) },
      })
    ).json().data.id;
    storeId = (await post("/stores", { name: "PO Store", code: "POS1" })).json().data.id;
    supplierId = (await post("/suppliers", { name: "Acme Supply", code: "ACME" })).json().data.id;
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

  it("rejects a PO with duplicate productId lines or mismatched line currencies", async () => {
    const dup = await post(
      "/purchasing/orders",
      {
        supplierId,
        storeId,
        lines: [
          { productId: productAId, qty: 1, unitCost: money(100) },
          { productId: productAId, qty: 2, unitCost: money(100) },
        ],
      },
      creator,
    );
    expect(dup.statusCode).toBe(400);

    const mixed = await post(
      "/purchasing/orders",
      {
        supplierId,
        storeId,
        lines: [
          { productId: productAId, qty: 1, unitCost: { amount: 100, currency: "BDT" } },
          { productId: productBId, qty: 1, unitCost: { amount: 100, currency: "USD" } },
        ],
      },
      creator,
    );
    expect(mixed.statusCode).toBe(400);
  });

  let poId: string;

  it("creates a DRAFT purchase order with a computed total", async () => {
    const res = await post(
      "/purchasing/orders",
      {
        supplierId,
        storeId,
        lines: [
          { productId: productAId, qty: 10, unitCost: money(500) },
          { productId: productBId, qty: 5, unitCost: money(300) },
        ],
      },
      creator,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe("DRAFT");
    expect(res.json().data.total).toEqual(money(10 * 500 + 5 * 300));
    poId = res.json().data.id;
  });

  it("segregates MANAGE (create) from APPROVE: the creator role cannot approve its own PO", async () => {
    const denied = await post(`/purchasing/orders/${poId}/approve`, {}, creator);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("FORBIDDEN");
  });

  it("approves the PO (admin has PURCHASING_APPROVE)", async () => {
    const res = await post(`/purchasing/orders/${poId}/approve`, {}, admin);
    expect(res.statusCode).toBe(201); // POST default (matches the rest of the API, e.g. the auth webhook)
    expect(res.json().data.status).toBe("APPROVED");
  });

  it("rejects editing an APPROVED purchase order", async () => {
    const res = await patch(`/purchasing/orders/${poId}`, { notes: "too late" }, creator);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("requires an Idempotency-Key to post a goods receipt", async () => {
    const res = await post(
      "/purchasing/receipts",
      { poId, lines: [{ productId: productAId, qty: 1 }] },
      creator,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects a GRN line for a product not on the purchase order", async () => {
    const prodRes = await get("/catalog/products?sort=-createdAt&limit=1");
    const unitRes = await get("/catalog/units?limit=1");
    const foreignProduct = (
      await post("/catalog/products", {
        sku: "SKU-PUR-FOREIGN",
        name: "Foreign",
        categoryId: prodRes.json().data[0].categoryId,
        unitId: unitRes.json().data[0].id,
        pricing: { costPrice: money(1), sellPrice: money(2) },
      })
    ).json().data.id;
    const res = await postIdem(
      "/purchasing/receipts",
      { poId, lines: [{ productId: foreignProduct, qty: 1 }] },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("posts a partial GRN: stock is updated (batch+ledger+cache) and PO turns PARTIALLY_RECEIVED", async () => {
    const res = await postIdem(
      "/purchasing/receipts",
      {
        poId,
        lines: [
          {
            productId: productAId,
            qty: 4,
            batchNo: "GRN-B1",
            expiryDate: "2027-01-01T00:00:00.000Z",
          },
        ],
      },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.number).toMatch(/^GRN-/);
    expect(await levelAt(productAId)).toBe(4);

    const po = await get(`/purchasing/orders/${poId}`);
    expect(po.json().data.status).toBe("PARTIALLY_RECEIVED");
    const lineA = po
      .json()
      .data.lines.find((l: { productId: string }) => l.productId === productAId);
    expect(lineA.receivedQty).toBe(4);

    // Movement used the PO line's unitCost (not supplied on this GRN line).
    const moves = await get(
      `/inventory/movements?productId=${productAId}&storeId=${storeId}&type=RECEIPT&limit=10`,
    );
    expect(moves.json().data[0].unitCost).toEqual(money(500));
  });

  it("rejects an over-receipt beyond the remaining PO quantity, atomically (stock+PO unchanged)", async () => {
    const beforeLevel = await levelAt(productAId);
    const beforePo = await get(`/purchasing/orders/${poId}`);
    const res = await postIdem(
      "/purchasing/receipts",
      { poId, lines: [{ productId: productAId, qty: 7 }] }, // remaining is 10-4=6
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    expect(await levelAt(productAId)).toBe(beforeLevel);
    const afterPo = await get(`/purchasing/orders/${poId}`);
    expect(afterPo.json().data.lines).toEqual(beforePo.json().data.lines);
  });

  it("completes receiving: PO turns RECEIVED once every line is fully received", async () => {
    const res = await postIdem(
      "/purchasing/receipts",
      {
        poId,
        lines: [
          { productId: productAId, qty: 6 },
          { productId: productBId, qty: 5, unitCost: money(310) }, // override the PO's unitCost
        ],
      },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(201);
    expect(await levelAt(productAId)).toBe(10);
    expect(await levelAt(productBId)).toBe(5);

    const po = await get(`/purchasing/orders/${poId}`);
    expect(po.json().data.status).toBe("RECEIVED");

    const moves = await get(
      `/inventory/movements?productId=${productBId}&storeId=${storeId}&type=RECEIPT&limit=10`,
    );
    expect(moves.json().data[0].unitCost).toEqual(money(310)); // override took effect
  });

  it("rejects any further GRN against a fully RECEIVED purchase order", async () => {
    const res = await postIdem(
      "/purchasing/receipts",
      { poId, lines: [{ productId: productAId, qty: 1 }] },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(409);
  });

  it("cancels a DRAFT purchase order, and rejects approving a cancelled one", async () => {
    const draft = await post(
      "/purchasing/orders",
      { supplierId, storeId, lines: [{ productId: productAId, qty: 1, unitCost: money(100) }] },
      creator,
    );
    const id = draft.json().data.id;

    const cancelled = await del(`/purchasing/orders/${id}`, creator);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe("CANCELLED");

    const approve = await post(`/purchasing/orders/${id}/approve`, {}, admin);
    expect(approve.statusCode).toBe(409);
  });

  it("posts a purchase return: FEFO-consumes stock and decrements the cache", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/purchasing/returns",
      { supplierId, storeId, reason: "damaged", lines: [{ productId: productAId, qty: 3 }] },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.number).toMatch(/^PRT-/);
    expect(await levelAt(productAId)).toBe(before - 3);

    const moves = await get(
      `/inventory/movements?productId=${productAId}&storeId=${storeId}&type=RETURN&limit=10`,
    );
    expect(moves.json().data[0].qty).toBe(-3);
  });

  it("rejects a purchase return that exceeds available stock (409 INSUFFICIENT_STOCK)", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/purchasing/returns",
      { supplierId, storeId, reason: "too much", lines: [{ productId: productAId, qty: 999999 }] },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INSUFFICIENT_STOCK");
    expect(await levelAt(productAId)).toBe(before);
  });

  it("rejects a purchase return referencing a non-existent GRN", async () => {
    const res = await postIdem(
      "/purchasing/returns",
      {
        supplierId,
        storeId,
        grnId: "507f1f77bcf86cd799439011",
        reason: "bad ref",
        lines: [{ productId: productAId, qty: 1 }],
      },
      randomUUID(),
      creator,
    );
    expect(res.statusCode).toBe(400);
  });

  it("keeps the ledger the source of truth after the full PO+GRN+return flow", async () => {
    const moves = await get(
      `/inventory/movements?productId=${productAId}&storeId=${storeId}&limit=200`,
    );
    const sum = (moves.json().data as Array<{ qty: number }>).reduce((a, m) => a + m.qty, 0);
    expect(sum).toBe(await levelAt(productAId));
  });

  it("allows a read-only role to list/get but not create purchase orders, GRNs, or returns", async () => {
    expect((await get("/purchasing/orders", reader)).statusCode).toBe(200);
    expect((await get("/purchasing/receipts", reader)).statusCode).toBe(200);
    expect((await get("/purchasing/returns", reader)).statusCode).toBe(200);

    const createPo = await post(
      "/purchasing/orders",
      { supplierId, storeId, lines: [{ productId: productAId, qty: 1, unitCost: money(1) }] },
      reader,
    );
    expect(createPo.statusCode).toBe(403);
  });
});
