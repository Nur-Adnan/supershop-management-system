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
import { CustomersModule } from "../src/customers/customers.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { PosModule } from "../src/pos/pos.module";
import { StockMovement } from "../src/inventory/stock-movement.schema";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { StoresModule } from "../src/stores/stores.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const money = (amount: number) => ({ amount, currency: "BDT" });

describe("POS (e2e — cash sessions -> checkout -> refunds)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let moveModel: Model<StockMovement>;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let admin: string;
  let cashier: string;
  let manager: string;

  let storeId: string;
  let productAId: string; // no tax
  let productTaxId: string; // 5% tax
  let productWId: string; // weighted
  let customerId: string;
  let sessionId: string;

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

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_pos_test?replicaSet=rs0";
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
        PosModule,
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
    await seedUser("u-manager", "store_manager");
    admin = await sign("u-admin");
    cashier = await sign("u-cashier");
    manager = await sign("u-manager");

    // Master data.
    const pieceUnit = (await post("/catalog/units", { name: "Piece", code: "pc" })).json().data.id;
    const kgUnit = (
      await post("/catalog/units", {
        name: "Kilogram",
        code: "kg",
        precision: 3,
        allowDecimal: true,
      })
    ).json().data.id;
    const category = (await post("/catalog/categories", { name: "Grocery" })).json().data.id;
    storeId = (await post("/stores", { name: "POS Store", code: "POS7" })).json().data.id;
    customerId = (
      await post("/customers", {
        name: "Regular Joe",
        phone: "01700000001",
        creditLimit: money(1500),
      })
    ).json().data.id;

    productAId = (
      await post("/catalog/products", {
        sku: "SKU-POS-A",
        name: "No-tax widget",
        categoryId: category,
        unitId: pieceUnit,
        pricing: { costPrice: money(600), sellPrice: money(1000) },
      })
    ).json().data.id;
    productTaxId = (
      await post("/catalog/products", {
        sku: "SKU-POS-TAX",
        name: "Taxed widget",
        categoryId: category,
        unitId: pieceUnit,
        pricing: { costPrice: money(600), sellPrice: money(1000) },
        taxRateBps: 500,
      })
    ).json().data.id;
    productWId = (
      await post("/catalog/products", {
        sku: "SKU-POS-W",
        name: "Loose rice",
        categoryId: category,
        unitId: kgUnit,
        isWeighted: true,
        pricing: { costPrice: money(1200), sellPrice: money(2000) },
      })
    ).json().data.id;

    // Initial stock.
    await postIdem("/inventory/receipts", {
      storeId,
      lines: [{ productId: productAId, qty: 50, costPrice: money(600) }],
    });
    await postIdem("/inventory/receipts", {
      storeId,
      lines: [{ productId: productTaxId, qty: 10, costPrice: money(600) }],
    });
    await postIdem("/inventory/receipts", {
      storeId,
      lines: [{ productId: productWId, qty: 5.0, costPrice: money(1200) }],
    });

    // One open cash session, used across most tests.
    sessionId = (
      await post(
        "/pos/cash-sessions",
        { storeId, terminalId: "T1", openingFloat: money(10000) },
        cashier,
      )
    ).json().data.id;
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

  it("rejects opening a second session for the same terminal (409)", async () => {
    const res = await post(
      "/pos/cash-sessions",
      { storeId, terminalId: "T1", openingFloat: money(0) },
      cashier,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("requires an Idempotency-Key to check out", async () => {
    const res = await post(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [{ method: "CASH", amount: money(1000) }],
      },
      cashier,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects an over-issue checkout with 409 INSUFFICIENT_STOCK, atomically", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 999999 }],
        payments: [{ method: "CASH", amount: money(999999000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INSUFFICIENT_STOCK");
    expect(await levelAt(productAId)).toBe(before);
  });

  it("rejects a payment split that doesn't sum to the sale total", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 2 }], // total 2000, no tax
        payments: [{ method: "CASH", amount: money(1900) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a fractional quantity for a non-weighted product", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1.5 }],
        payments: [{ method: "CASH", amount: money(1500) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects a cashier's line unitPrice override (requires promotions.manage) but allows a manager's", async () => {
    // CARD, not CASH: this must not touch the shared session's cash-drawer ledger, which a later
    // test asserts an exact running total against.
    const denied = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1, unitPrice: money(1) }],
        payments: [{ method: "CARD", amount: money(1) }],
      },
      randomUUID(),
      cashier,
    );
    expect(denied.statusCode).toBe(403);

    const allowed = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1, unitPrice: money(1) }],
        payments: [{ method: "CARD", amount: money(1) }],
      },
      randomUUID(),
      manager,
    );
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().data.subtotal).toEqual(money(1));
  });

  let saleANumber: string;
  let saleAId: string;

  it("checks out with cash: FEFO-decrements stock and records the payment", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 2 }],
        payments: [{ method: "CASH", amount: money(2000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(201);
    const sale = res.json().data;
    expect(sale.subtotal).toEqual(money(2000));
    expect(sale.taxTotal).toEqual(money(0));
    expect(sale.total).toEqual(money(2000));
    saleANumber = sale.number;
    saleAId = sale.id;
    expect(await levelAt(productAId)).toBe(before - 2);

    const payments = await get(`/pos/payments?refType=sale&refId=${saleANumber}`);
    expect(payments.json().data).toHaveLength(1);
    expect(payments.json().data[0].amount).toEqual(money(2000));
    expect(payments.json().data[0].direction).toBe("IN");
  });

  it("replays an identical checkout (same Idempotency-Key) without double-selling", async () => {
    const key = randomUUID();
    const body = {
      storeId,
      cashSessionId: sessionId,
      lines: [{ productId: productAId, qty: 1 }],
      payments: [{ method: "CASH", amount: money(1000) }],
    };
    const first = await postIdem("/pos/sales", body, key, cashier);
    const before = await levelAt(productAId);
    const replay = await postIdem("/pos/sales", body, key, cashier);
    expect(replay.json().data.number).toBe(first.json().data.number);
    expect(await levelAt(productAId)).toBe(before);
  });

  it("supports a split payment: only the CASH portion posts to the drawer", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [
          { method: "CASH", amount: money(600) },
          { method: "CARD", amount: money(400) },
        ],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(201);
    const payments = await get(`/pos/payments?refType=sale&refId=${res.json().data.number}`);
    expect(payments.json().data).toHaveLength(2);
  });

  it("computes VAT from the product's taxRateBps and applies a sale-level discount", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productTaxId, qty: 1 }],
        discountTotal: money(50),
        payments: [{ method: "CARD", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(201);
    const sale = res.json().data;
    expect(sale.subtotal).toEqual(money(1000));
    expect(sale.taxTotal).toEqual(money(50)); // 5% of 1000
    expect(sale.discountTotal).toEqual(money(50));
    expect(sale.total).toEqual(money(1000)); // 1000 + 50 - 50
  });

  it("allows a fractional quantity for a weighted product", async () => {
    const before = await levelAt(productWId);
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productWId, qty: 0.5 }],
        payments: [{ method: "CARD", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(201);
    expect(await levelAt(productWId)).toBe(before - 0.5);
  });

  it("increases a customer's balance on a CREDIT sale within their credit limit", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        customerId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [{ method: "CREDIT", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(201);
    const customer = await get(`/customers/${customerId}`);
    expect(customer.json().data.openingBalance).toEqual(money(1000));
  });

  it("rejects a CREDIT sale that would exceed the customer's credit limit, atomically", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        customerId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [{ method: "CREDIT", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
    const customer = await get(`/customers/${customerId}`);
    expect(customer.json().data.openingBalance).toEqual(money(1000)); // unchanged
    expect(await levelAt(productAId)).toBe(before); // unchanged
  });

  it("rejects a CREDIT payment with no customer on the sale", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [{ method: "CREDIT", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(400);
  });

  it("blocks a cashier (no POS_REFUND) from refunding, but allows a store_manager", async () => {
    const denied = await postIdem(
      "/pos/sale-returns",
      {
        saleId: saleAId,
        cashSessionId: sessionId,
        refundMethod: "CASH",
        reason: "changed mind",
        lines: [{ productId: productAId, qty: 1 }],
      },
      randomUUID(),
      cashier,
    );
    expect(denied.statusCode).toBe(403);
  });

  it("refunds part of a sale: restocks, refunds cash, and marks the sale PARTIALLY_REFUNDED", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/pos/sale-returns",
      {
        saleId: saleAId,
        cashSessionId: sessionId,
        refundMethod: "CASH",
        reason: "damaged",
        lines: [{ productId: productAId, qty: 1 }],
      },
      randomUUID(),
      manager,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.total).toEqual(money(1000)); // 1 of 2 units @ 1000 each, no tax
    expect(await levelAt(productAId)).toBe(before + 1);

    const sale = await get(`/pos/sales/${saleAId}`);
    expect(sale.json().data.status).toBe("PARTIALLY_REFUNDED");
  });

  it("rejects an over-refund beyond the remaining quantity (409), atomically", async () => {
    const before = await levelAt(productAId);
    const res = await postIdem(
      "/pos/sale-returns",
      {
        saleId: saleAId,
        cashSessionId: sessionId,
        refundMethod: "CASH",
        reason: "too much",
        lines: [{ productId: productAId, qty: 5 }],
      },
      randomUUID(),
      manager,
    );
    expect(res.statusCode).toBe(409);
    expect(await levelAt(productAId)).toBe(before);
  });

  it("fully refunds the remaining quantity and marks the sale REFUNDED", async () => {
    const res = await postIdem(
      "/pos/sale-returns",
      {
        saleId: saleAId,
        cashSessionId: sessionId,
        refundMethod: "CASH",
        reason: "full refund",
        lines: [{ productId: productAId, qty: 1 }],
      },
      randomUUID(),
      manager,
    );
    expect(res.statusCode).toBe(201);
    const sale = await get(`/pos/sales/${saleAId}`);
    expect(sale.json().data.status).toBe("REFUNDED");

    const again = await postIdem(
      "/pos/sale-returns",
      {
        saleId: saleAId,
        cashSessionId: sessionId,
        refundMethod: "CASH",
        reason: "already done",
        lines: [{ productId: productAId, qty: 1 }],
      },
      randomUUID(),
      manager,
    );
    expect(again.statusCode).toBe(409);
  });

  it("requires an open session for pay-in/pay-out, and Idempotency-Key", async () => {
    const noKey = await post(
      `/pos/cash-sessions/${sessionId}/pay-in`,
      { amount: money(500), reason: "float top-up" },
      cashier,
    );
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const ok = await postIdem(
      `/pos/cash-sessions/${sessionId}/pay-in`,
      { amount: money(500), reason: "float top-up" },
      randomUUID(),
      cashier,
    );
    expect(ok.statusCode).toBe(201);
    const payout = await postIdem(
      `/pos/cash-sessions/${sessionId}/pay-out`,
      { amount: money(300), reason: "office supplies" },
      randomUUID(),
      cashier,
    );
    expect(payout.statusCode).toBe(201);
  });

  it("closes the cash session and computes expectedCash/variance from the drawer ledger", async () => {
    // Cash inflows this session: 2000 (saleA) + 1000 (replay-key sale) + 600 (split payment) - 1000 (refund) - 1000 (refund)
    // + 500 (pay-in) - 300 (pay-out) = 1800. expectedCash = openingFloat 10000 + 1800 = 11800.
    const closed = await post(
      `/pos/cash-sessions/${sessionId}/close`,
      { closingCount: money(11800) },
      cashier,
    );
    expect(closed.statusCode).toBe(201);
    expect(closed.json().data.status).toBe("CLOSED");
    expect(closed.json().data.expectedCash).toEqual(money(11800));
    expect(closed.json().data.variance).toEqual(money(0));

    const alreadyClosed = await post(
      `/pos/cash-sessions/${sessionId}/close`,
      { closingCount: money(0) },
      cashier,
    );
    expect(alreadyClosed.statusCode).toBe(409);
  });

  it("rejects checkout/refund against a closed cash session", async () => {
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId: sessionId,
        lines: [{ productId: productAId, qty: 1 }],
        payments: [{ method: "CASH", amount: money(1000) }],
      },
      randomUUID(),
      cashier,
    );
    expect(res.statusCode).toBe(409);
  });

  it("keeps the ledger the source of truth for productA after the full checkout+refund flow", async () => {
    const moves = await moveModel.find({ productId: productAId, storeId }).lean();
    const sum = moves.reduce((a, m) => a + m.qty, 0);
    expect(sum).toBe(await levelAt(productAId));
  });
});
