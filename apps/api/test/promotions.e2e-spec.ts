import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { ConfigModule } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Model } from "mongoose";
import { LoyaltyTransactionType } from "@supershop/shared";
import { validateEnv } from "../src/config/env";
import { AccountingModule } from "../src/accounting/accounting.module";
import { AuditModule } from "../src/audit/audit.module";
import { AuthModule } from "../src/auth/auth.module";
import { CatalogModule } from "../src/catalog/catalog.module";
import { CommonModule } from "../src/common/common.module";
import { CustomersModule } from "../src/customers/customers.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { LoyaltyTransaction } from "../src/loyalty/loyalty-transaction.schema";
import { LoyaltyModule } from "../src/loyalty/loyalty.module";
import { PosModule } from "../src/pos/pos.module";
import { PromotionsModule } from "../src/promotions/promotions.module";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { StoresModule } from "../src/stores/stores.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const money = (amount: number) => ({ amount, currency: "BDT" });

describe("Promotions & Loyalty (e2e — promotion CRUD, checkout integration, loyalty ledger)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let loyaltyModel: Model<LoyaltyTransaction>;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let admin: string;
  let manager: string; // store_manager: PROMOTIONS_READ + PROMOTIONS_MANAGE
  let cashier: string; // cashier: PROMOTIONS_READ only
  let noPromoAccess: string; // inventory_clerk: no PROMOTIONS_* at all

  let storeId: string;
  let categoryId: string;
  let unitId: string;
  let productId: string; // sellPrice 1000, costPrice 600, no tax
  let cheapProductId: string; // sellPrice 100, costPrice 50, no tax
  let cashSessionId: string;

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
  const postIdem = (url: string, body: unknown, k = randomUUID(), t = admin) =>
    app.inject({
      method: "POST",
      url,
      headers: { ...auth(t), "idempotency-key": k },
      payload: body as object,
    });

  function farFuture(): { validFrom: string; validTo: string } {
    return { validFrom: "2026-01-01T00:00:00.000Z", validTo: "2030-01-01T00:00:00.000Z" };
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

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_promotions_test?replicaSet=rs0";
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
        CustomersModule,
        InventoryModule,
        AccountingModule,
        PromotionsModule,
        LoyaltyModule,
        PosModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    loyaltyModel = app.get<Model<LoyaltyTransaction>>(getModelToken(LoyaltyTransaction.name));
    await userModel.deleteMany({});

    await seedUserWithRoleName("u-admin", "super_admin");
    await seedUserWithRoleName("u-manager", "store_manager");
    await seedUserWithRoleName("u-cashier", "cashier");
    await seedUserWithRoleName("u-noaccess", "inventory_clerk");
    admin = await sign("u-admin");
    manager = await sign("u-manager");
    cashier = await sign("u-cashier");
    noPromoAccess = await sign("u-noaccess");

    unitId = (await post("/catalog/units", { name: "Piece", code: "pc" })).json().data.id;
    categoryId = (await post("/catalog/categories", { name: "Grocery" })).json().data.id;
    storeId = (await post("/stores", { name: "Promo Store", code: "PROMO1" })).json().data.id;
    productId = (
      await post("/catalog/products", {
        sku: "SKU-PROMO-A",
        name: "Widget",
        categoryId,
        unitId,
        pricing: { costPrice: money(600), sellPrice: money(1000) },
      })
    ).json().data.id;
    cheapProductId = (
      await post("/catalog/products", {
        sku: "SKU-PROMO-CHEAP",
        name: "Cheap widget",
        categoryId,
        unitId,
        pricing: { costPrice: money(50), sellPrice: money(100) },
      })
    ).json().data.id;
    cashSessionId = (
      await post(
        "/pos/cash-sessions",
        { storeId, terminalId: "T-PROMO", openingFloat: money(0) },
        admin,
      )
    ).json().data.id;

    await postIdem(
      "/inventory/receipts",
      { storeId, lines: [{ productId, qty: 100, costPrice: money(600) }] },
      randomUUID(),
      admin,
    );
    await postIdem(
      "/inventory/receipts",
      { storeId, lines: [{ productId: cheapProductId, qty: 50, costPrice: money(50) }] },
      randomUUID(),
      admin,
    );
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

  describe("Promotion CRUD", () => {
    it("creates a PERCENT promotion", async () => {
      const res = await post(
        "/promotions",
        { code: "save10", name: "Save 10%", type: "PERCENT", valueBps: 1000, ...farFuture() },
        manager,
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.code).toBe("SAVE10"); // Mongoose uppercase: true setter
    });

    it("creates a FIXED promotion", async () => {
      const res = await post(
        "/promotions",
        {
          code: "FLAT200",
          name: "Flat 200 off",
          type: "FIXED",
          valueAmount: money(200),
          minSubtotal: money(1000),
          ...farFuture(),
        },
        manager,
      );
      expect(res.statusCode).toBe(201);
    });

    it("rejects a duplicate code", async () => {
      const res = await post(
        "/promotions",
        { code: "SAVE10", name: "Dup", type: "PERCENT", valueBps: 500, ...farFuture() },
        manager,
      );
      expect(res.statusCode).toBe(409);
    });

    it("rejects PERCENT with valueAmount also set, and FIXED with valueBps also set", async () => {
      const bothOnPercent = await post(
        "/promotions",
        {
          code: "BAD1",
          name: "Bad",
          type: "PERCENT",
          valueBps: 500,
          valueAmount: money(100),
          ...farFuture(),
        },
        manager,
      );
      expect(bothOnPercent.statusCode).toBe(400);

      const bothOnFixed = await post(
        "/promotions",
        {
          code: "BAD2",
          name: "Bad",
          type: "FIXED",
          valueBps: 500,
          valueAmount: money(100),
          ...farFuture(),
        },
        manager,
      );
      expect(bothOnFixed.statusCode).toBe(400);
    });

    it("rejects validFrom on or after validTo", async () => {
      const res = await post(
        "/promotions",
        {
          code: "BAD3",
          name: "Bad window",
          type: "PERCENT",
          valueBps: 500,
          validFrom: "2026-06-01T00:00:00.000Z",
          validTo: "2026-01-01T00:00:00.000Z",
        },
        manager,
      );
      expect(res.statusCode).toBe(400);
    });

    it("rejects a non-existent productId/categoryId/customerGroupId reference", async () => {
      const res = await post(
        "/promotions",
        {
          code: "BAD4",
          name: "Bad ref",
          type: "PERCENT",
          valueBps: 500,
          productIds: ["507f1f77bcf86cd799439011"],
          ...farFuture(),
        },
        manager,
      );
      expect(res.statusCode).toBe(400);
    });

    it("allows a read-only cashier to list/get but not create", async () => {
      expect((await get("/promotions", cashier)).statusCode).toBe(200);
      const create = await post(
        "/promotions",
        { code: "BAD5", name: "Denied", type: "PERCENT", valueBps: 500, ...farFuture() },
        cashier,
      );
      expect(create.statusCode).toBe(403);
    });

    it("denies all promotions access to a role with no promotions permission", async () => {
      expect((await get("/promotions", noPromoAccess)).statusCode).toBe(403);
    });
  });

  describe("Checkout integration", () => {
    it("applies a PERCENT promotion, increments usageCount, and posts the reduced revenue", async () => {
      // qty 5 @ 1000 = subtotal 5000, no tax. 10% off -> discount 500. total 4500.
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 5 }],
          promotionCode: "save10",
          payments: [{ method: "CASH", amount: money(4500) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(201);
      const sale = res.json().data;
      expect(sale.promotionCode).toBe("SAVE10");
      expect(sale.promotionDiscount).toEqual(money(500));
      expect(sale.total).toEqual(money(4500));

      const promo = (await get("/promotions?code=SAVE10", manager)).json().data[0];
      expect(promo.usageCount).toBe(1);
    });

    it("applies a FIXED promotion capped at the eligible subtotal, and rejects below minSubtotal", async () => {
      const belowMin = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId: cheapProductId, qty: 1 }], // subtotal 100 < minSubtotal 1000
          promotionCode: "FLAT200",
          payments: [{ method: "CASH", amount: money(100) }],
        },
        randomUUID(),
        admin,
      );
      expect(belowMin.statusCode).toBe(400);

      // qty 1 @ 1000 = subtotal 1000, meets minSubtotal. FIXED discount 200 -> total 800.
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 1 }],
          promotionCode: "FLAT200",
          payments: [{ method: "CASH", amount: money(800) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.promotionDiscount).toEqual(money(200));
      expect(res.json().data.total).toEqual(money(800));
    });

    it("rejects an unknown promotion code", async () => {
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 1 }],
          promotionCode: "NOPE",
          payments: [{ method: "CASH", amount: money(1000) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(400);
    });

    it("rejects once a usage-limited promotion is exhausted", async () => {
      await post(
        "/promotions",
        {
          code: "ONCE",
          name: "Once only",
          type: "PERCENT",
          valueBps: 1000,
          usageLimit: 1,
          ...farFuture(),
        },
        manager,
      );
      const first = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 1 }],
          promotionCode: "ONCE",
          payments: [{ method: "CASH", amount: money(900) }],
        },
        randomUUID(),
        admin,
      );
      expect(first.statusCode).toBe(201);

      const second = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 1 }],
          promotionCode: "ONCE",
          payments: [{ method: "CASH", amount: money(900) }],
        },
        randomUUID(),
        admin,
      );
      expect(second.statusCode).toBe(409);
    });

    it("restricts a promotion's discount to its productIds, ignoring unrelated lines", async () => {
      await post(
        "/promotions",
        {
          code: "WIDGETONLY",
          name: "Widget only",
          type: "PERCENT",
          valueBps: 1000,
          productIds: [productId],
          ...farFuture(),
        },
        manager,
      );
      // productId line: subtotal 1000 (eligible). cheapProductId line: subtotal 100 (not eligible).
      // Combined subtotal 1100; 10% of the eligible 1000 = 100 discount. Total = 1100 - 100 = 1000.
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [
            { productId, qty: 1 },
            { productId: cheapProductId, qty: 1 },
          ],
          promotionCode: "WIDGETONLY",
          payments: [{ method: "CASH", amount: money(1000) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.promotionDiscount).toEqual(money(100));
      expect(res.json().data.total).toEqual(money(1000));
    });
  });

  describe("Loyalty", () => {
    let customerId: string;

    it("earns points from net revenue on checkout", async () => {
      customerId = (
        await post("/customers", { name: "Loyal Larry", phone: "01700000001" }, admin)
      ).json().data.id;

      // qty 10 @ 1000 = subtotal/netRevenue 10000, no discount -> 100 points (1 per 100 units).
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          customerId,
          lines: [{ productId, qty: 10 }],
          payments: [{ method: "CASH", amount: money(10000) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.pointsEarned).toBe(100);

      const customer = (await get(`/customers/${customerId}`, admin)).json().data;
      expect(customer.loyaltyPoints).toBe(100);

      const ledger = await get(`/loyalty/transactions?customerId=${customerId}`, admin);
      expect(ledger.json().data).toHaveLength(1);
      expect(ledger.json().data[0]).toMatchObject({ type: "EARN", points: 100 });
    });

    it("redeems points as an additional discount, reducing the balance", async () => {
      // qty 1 @ 100 = subtotal 100. Redeem 50 points (1:1) -> discount 50, total 50.
      // netRevenue 50 -> 0 points earned (floor(50/100)).
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          customerId,
          lines: [{ productId: cheapProductId, qty: 1 }],
          redeemPoints: 50,
          payments: [{ method: "CASH", amount: money(50) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().data.redemptionDiscount).toEqual(money(50));
      expect(res.json().data.total).toEqual(money(50));
      expect(res.json().data.pointsEarned).toBeUndefined();

      const customer = (await get(`/customers/${customerId}`, admin)).json().data;
      expect(customer.loyaltyPoints).toBe(50); // 100 - 50 redeemed + 0 earned

      const ledger = await get(`/loyalty/transactions?customerId=${customerId}`, admin);
      expect(ledger.json().data).toHaveLength(2);
    });

    it("rejects redeeming more points than the customer's balance", async () => {
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          customerId,
          lines: [{ productId, qty: 2 }],
          redeemPoints: 1000,
          payments: [{ method: "CASH", amount: money(1000) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(400);

      // Balance is unchanged after the aborted transaction.
      const customer = (await get(`/customers/${customerId}`, admin)).json().data;
      expect(customer.loyaltyPoints).toBe(50);
    });

    it("rejects redeeming points without a customer on the sale", async () => {
      const res = await postIdem(
        "/pos/sales",
        {
          storeId,
          cashSessionId,
          lines: [{ productId, qty: 1 }],
          redeemPoints: 10,
          payments: [{ method: "CASH", amount: money(1000) }],
        },
        randomUUID(),
        admin,
      );
      expect(res.statusCode).toBe(400);
    });

    it("keeps loyalty_transactions append-only (immutable) at the schema layer", async () => {
      const doc = await loyaltyModel.findOne({ type: LoyaltyTransactionType.EARN }).lean();
      await expect(
        loyaltyModel.updateOne({ _id: doc!._id }, { $set: { points: 999 } }).exec(),
      ).rejects.toThrow(/immutable/);
    });
  });
});
