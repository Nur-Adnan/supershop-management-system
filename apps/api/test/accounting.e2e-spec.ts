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
import { AccountingModule } from "../src/accounting/accounting.module";
import { JournalEntry } from "../src/accounting/journal-entry.schema";
import { SYSTEM_ACCOUNTS } from "../src/accounting/system-accounts";
import { AuditModule } from "../src/audit/audit.module";
import { AuthModule } from "../src/auth/auth.module";
import { CatalogModule } from "../src/catalog/catalog.module";
import { CommonModule } from "../src/common/common.module";
import { CustomersModule } from "../src/customers/customers.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { PosModule } from "../src/pos/pos.module";
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

interface JournalLineDto {
  accountId: string;
  debit: number;
  credit: number;
}

describe("Accounting (e2e — chart of accounts, journal entries, expenses, full-flow integration)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let journalModel: Model<JournalEntry>;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let admin: string;
  let accountant: string;
  let reader: string;

  let storeId: string;
  let supplierId: string;
  let productId: string;
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

  async function accountIdByCode(code: string): Promise<string> {
    const res = await get(`/accounting/accounts?code=${code}&limit=1`, accountant);
    return res.json().data[0].id;
  }

  async function journalEntryFor(
    refType: string,
    refId: string,
  ): Promise<{ lines: JournalLineDto[]; currency: string }> {
    const res = await get(
      `/accounting/journal-entries?refType=${refType}&refId=${refId}&limit=10`,
      accountant,
    );
    const entries = res.json().data;
    expect(entries).toHaveLength(1);
    return entries[0];
  }

  function assertBalanced(entry: { lines: JournalLineDto[] }): void {
    const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(credit);
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

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_accounting_test?replicaSet=rs0";
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
        CustomersModule,
        InventoryModule,
        AccountingModule,
        PurchasingModule,
        PosModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    journalModel = app.get<Model<JournalEntry>>(getModelToken(JournalEntry.name));
    await userModel.deleteMany({});

    await roleModel.create({
      name: "accounting_reader_test",
      permissions: [PERMISSIONS.ACCOUNTING_READ],
      isSystem: false,
    });
    await seedUserWithRoleName("u-admin", "super_admin");
    await seedUserWithRoleName("u-accountant", "accountant");
    await seedUserWithRoleName("u-reader", "accounting_reader_test");
    admin = await sign("u-admin");
    accountant = await sign("u-accountant");
    reader = await sign("u-reader");

    // Master data + prerequisite stock for the integration checks.
    const unit = (await post("/catalog/units", { name: "Piece", code: "pc" })).json().data.id;
    const category = (await post("/catalog/categories", { name: "Grocery" })).json().data.id;
    storeId = (await post("/stores", { name: "Acct Store", code: "ACC1" })).json().data.id;
    supplierId = (await post("/suppliers", { name: "Acct Supplier", code: "ACCS" })).json().data.id;
    productId = (
      await post("/catalog/products", {
        sku: "SKU-ACC-A",
        name: "Widget",
        categoryId: category,
        unitId: unit,
        pricing: { costPrice: money(600), sellPrice: money(1000) },
        taxRateBps: 500, // 5%
      })
    ).json().data.id;
    cashSessionId = (
      await post(
        "/pos/cash-sessions",
        { storeId, terminalId: "T-ACC", openingFloat: money(0) },
        admin,
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

  it("seeds the system chart of accounts idempotently on boot", async () => {
    const res = await get("/accounting/accounts?limit=50", accountant);
    const codes = (res.json().data as Array<{ code: string; isSystem: boolean }>).map(
      (a) => a.code,
    );
    for (const code of Object.values(SYSTEM_ACCOUNTS)) {
      expect(codes).toContain(code);
    }
    const cash = (res.json().data as Array<{ code: string; isSystem: boolean }>).find(
      (a) => a.code === "1000",
    );
    expect(cash!.isSystem).toBe(true);
  });

  let subAccountId: string;

  it("creates a custom sub-account under a system account, rejects a bad parent and a cycle", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const created = await post(
      "/accounting/accounts",
      { code: "1001", name: "Petty Cash", type: "ASSET", parentId: cashId },
      accountant,
    );
    expect(created.statusCode).toBe(201);
    subAccountId = created.json().data.id;

    const badParent = await post(
      "/accounting/accounts",
      { code: "1002", name: "Bad", type: "ASSET", parentId: "507f1f77bcf86cd799439011" },
      accountant,
    );
    expect(badParent.statusCode).toBe(400);

    const selfCycle = await patch(
      `/accounting/accounts/${subAccountId}`,
      { parentId: subAccountId },
      accountant,
    );
    expect(selfCycle.statusCode).toBe(400);
  });

  it("rejects modifying or deleting a system account", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const update = await patch(
      `/accounting/accounts/${cashId}`,
      { name: "Renamed Cash" },
      accountant,
    );
    expect(update.statusCode).toBe(403);
    const remove = await del(`/accounting/accounts/${cashId}`, accountant);
    expect(remove.statusCode).toBe(403);
  });

  it("allows deleting a non-system account", async () => {
    const res = await del(`/accounting/accounts/${subAccountId}`, accountant);
    expect(res.statusCode).toBe(200);
  });

  it("requires an Idempotency-Key to post a manual journal entry", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const equityId = await accountIdByCode(SYSTEM_ACCOUNTS.OWNERS_EQUITY);
    const res = await post(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 1000, credit: 0 },
          { accountId: equityId, debit: 0, credit: 1000 },
        ],
        currency: "BDT",
      },
      accountant,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects an unbalanced manual journal entry, and a line with both debit and credit set", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const equityId = await accountIdByCode(SYSTEM_ACCOUNTS.OWNERS_EQUITY);

    const unbalanced = await postIdem(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 1000, credit: 0 },
          { accountId: equityId, debit: 0, credit: 900 },
        ],
        currency: "BDT",
      },
      randomUUID(),
      accountant,
    );
    expect(unbalanced.statusCode).toBe(400);
    expect(unbalanced.json().error.code).toBe("VALIDATION_ERROR");

    const both = await postIdem(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 1000, credit: 500 },
          { accountId: equityId, debit: 0, credit: 500 },
        ],
        currency: "BDT",
      },
      randomUUID(),
      accountant,
    );
    expect(both.statusCode).toBe(400);
  });

  it("rejects a manual journal entry referencing a non-existent account", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const res = await postIdem(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 1000, credit: 0 },
          { accountId: "507f1f77bcf86cd799439011", debit: 0, credit: 1000 },
        ],
        currency: "BDT",
      },
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(400);
  });

  let openingEntryId: string;

  it("posts a balanced manual journal entry (owner's opening investment)", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const equityId = await accountIdByCode(SYSTEM_ACCOUNTS.OWNERS_EQUITY);
    const res = await postIdem(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 500000, credit: 0 },
          { accountId: equityId, debit: 0, credit: 500000 },
        ],
        currency: "BDT",
        description: "Owner's opening investment",
      },
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().data.number).toMatch(/^JE-/);
    openingEntryId = res.json().data.id;
    assertBalanced(res.json().data);
  });

  it("reverses a posted journal entry with an equal-and-opposite entry", async () => {
    const res = await postIdem(
      `/accounting/journal-entries/${openingEntryId}/reverse`,
      {},
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(201);
    const reversal = res.json().data;
    assertBalanced(reversal);

    const original = await get(`/accounting/journal-entries/${openingEntryId}`, accountant);
    const originalLines = original.json().data.lines as JournalLineDto[];
    const reversedLines = reversal.lines as JournalLineDto[];
    for (const line of originalLines) {
      const swapped = reversedLines.find((l) => l.accountId === line.accountId);
      expect(swapped).toMatchObject({ debit: line.credit, credit: line.debit });
    }
  });

  it("keeps journal_entries append-only (immutable) at the schema layer", async () => {
    const doc = await journalModel.findOne({ number: { $exists: true } }).lean();
    await expect(
      journalModel.updateOne({ _id: doc!._id }, { $set: { description: "tampered" } }).exec(),
    ).rejects.toThrow(/immutable/);
  });

  it("records an expense and posts its journal entry", async () => {
    const expenseAccountId = await accountIdByCode(SYSTEM_ACCOUNTS.GENERAL_EXPENSES);
    const res = await postIdem(
      "/accounting/expenses",
      {
        accountId: expenseAccountId,
        amount: money(2500),
        paidVia: "CASH",
        description: "Office supplies",
      },
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(201);
    const entry = await journalEntryFor("expense", res.json().data.id);
    assertBalanced(entry);
    const expenseLine = entry.lines.find((l) => l.accountId === expenseAccountId);
    expect(expenseLine).toMatchObject({ debit: 2500, credit: 0 });
  });

  it("rejects an expense against a non-EXPENSE-type account", async () => {
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const res = await postIdem(
      "/accounting/expenses",
      { accountId: cashId, amount: money(100), paidVia: "CASH", description: "Wrong account" },
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(400);
  });

  it("posts an expense paid on CREDIT to Accounts Payable, not Accounts Receivable", async () => {
    const expenseAccountId = await accountIdByCode(SYSTEM_ACCOUNTS.GENERAL_EXPENSES);
    const res = await postIdem(
      "/accounting/expenses",
      {
        accountId: expenseAccountId,
        amount: money(5000),
        paidVia: "CREDIT",
        description: "Rent on credit",
      },
      randomUUID(),
      accountant,
    );
    expect(res.statusCode).toBe(201);
    const entry = await journalEntryFor("expense", res.json().data.id);
    assertBalanced(entry);
    const payableId = await accountIdByCode(SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE);
    const receivableId = await accountIdByCode(SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE);
    expect(entry.lines.find((l) => l.accountId === payableId)).toMatchObject({
      debit: 0,
      credit: 5000,
    });
    expect(entry.lines.find((l) => l.accountId === receivableId)).toBeUndefined();
  });

  it("rejects postings against a deactivated account (manual journal entry and expense)", async () => {
    const created = await post(
      "/accounting/accounts",
      { code: "5099", name: "Old Expense Account", type: "EXPENSE" },
      accountant,
    );
    const deactivatedId = created.json().data.id;
    await patch(`/accounting/accounts/${deactivatedId}`, { isActive: false }, accountant);

    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const manual = await postIdem(
      "/accounting/journal-entries",
      {
        lines: [
          { accountId: cashId, debit: 100, credit: 0 },
          { accountId: deactivatedId, debit: 0, credit: 100 },
        ],
        currency: "BDT",
      },
      randomUUID(),
      accountant,
    );
    expect(manual.statusCode).toBe(400);

    const expense = await postIdem(
      "/accounting/expenses",
      { accountId: deactivatedId, amount: money(100), paidVia: "CASH", description: "Should fail" },
      randomUUID(),
      accountant,
    );
    expect(expense.statusCode).toBe(400);
  });

  it("posts a balanced journal entry for a GRN (Dr Inventory / Cr Accounts Payable)", async () => {
    const po = await post(
      "/purchasing/orders",
      { supplierId, storeId, lines: [{ productId, qty: 20, unitCost: money(600) }] },
      admin,
    );
    await post(`/purchasing/orders/${po.json().data.id}/approve`, {}, admin);
    const grn = await postIdem(
      "/purchasing/receipts",
      { poId: po.json().data.id, lines: [{ productId, qty: 20 }] },
      randomUUID(),
      admin,
    );
    expect(grn.statusCode).toBe(201);

    const entry = await journalEntryFor("goods_receipt", grn.json().data.number);
    assertBalanced(entry);
    const inventoryId = await accountIdByCode(SYSTEM_ACCOUNTS.INVENTORY);
    const payableId = await accountIdByCode(SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE);
    expect(entry.lines.find((l) => l.accountId === inventoryId)).toMatchObject({
      debit: 12000,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === payableId)).toMatchObject({
      debit: 0,
      credit: 12000,
    });
  });

  it("rejects a GRN unit cost that deviates more than 10% from the purchase order's approved cost", async () => {
    const existing = (await get(`/catalog/products/${productId}`, admin)).json().data;
    const tolProduct = (
      await post(
        "/catalog/products",
        {
          sku: "SKU-ACC-TOL",
          name: "Tolerance Widget",
          categoryId: existing.categoryId,
          unitId: existing.unitId,
          pricing: { costPrice: money(1000), sellPrice: money(1500) },
        },
        admin,
      )
    ).json().data.id;
    const po = await post(
      "/purchasing/orders",
      { supplierId, storeId, lines: [{ productId: tolProduct, qty: 5, unitCost: money(1000) }] },
      admin,
    );
    await post(`/purchasing/orders/${po.json().data.id}/approve`, {}, admin);

    const tooHigh = await postIdem(
      "/purchasing/receipts",
      {
        poId: po.json().data.id,
        lines: [{ productId: tolProduct, qty: 5, unitCost: money(2000) }],
      }, // +100%
      randomUUID(),
      admin,
    );
    expect(tooHigh.statusCode).toBe(400);

    const withinTolerance = await postIdem(
      "/purchasing/receipts",
      {
        poId: po.json().data.id,
        lines: [{ productId: tolProduct, qty: 5, unitCost: money(1080) }],
      }, // +8%
      randomUUID(),
      admin,
    );
    expect(withinTolerance.statusCode).toBe(201);
  });

  let checkoutSaleId: string;
  let checkoutSaleNumber: string;

  it("posts a balanced journal entry for a POS checkout (revenue/tax/COGS/cash)", async () => {
    // qty 3 @ sellPrice 1000, 5% tax: subtotal 3000, tax 150, total 3150. costPrice 600 -> COGS 1800.
    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId,
        lines: [{ productId, qty: 3 }],
        payments: [{ method: "CASH", amount: money(3150) }],
      },
      randomUUID(),
      admin,
    );
    expect(res.statusCode).toBe(201);
    checkoutSaleId = res.json().data.id;
    checkoutSaleNumber = res.json().data.number;

    const entry = await journalEntryFor("sale", checkoutSaleNumber);
    assertBalanced(entry);
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const revenueId = await accountIdByCode(SYSTEM_ACCOUNTS.SALES_REVENUE);
    const taxId = await accountIdByCode(SYSTEM_ACCOUNTS.TAX_PAYABLE);
    const cogsId = await accountIdByCode(SYSTEM_ACCOUNTS.COST_OF_GOODS_SOLD);
    const inventoryId = await accountIdByCode(SYSTEM_ACCOUNTS.INVENTORY);
    expect(entry.lines.find((l) => l.accountId === cashId)).toMatchObject({
      debit: 3150,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === revenueId)).toMatchObject({
      debit: 0,
      credit: 3000,
    });
    expect(entry.lines.find((l) => l.accountId === taxId)).toMatchObject({ debit: 0, credit: 150 });
    expect(entry.lines.find((l) => l.accountId === cogsId)).toMatchObject({
      debit: 1800,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === inventoryId)).toMatchObject({
      debit: 0,
      credit: 1800,
    });
  });

  it("rejects a checkout whose stock cost currency does not match the sale currency", async () => {
    const existing = (await get(`/catalog/products/${productId}`, admin)).json().data;
    const mixedProduct = (
      await post(
        "/catalog/products",
        {
          sku: "SKU-ACC-MIXCUR",
          name: "Mixed Currency Widget",
          categoryId: existing.categoryId,
          unitId: existing.unitId,
          pricing: { costPrice: money(100), sellPrice: money(200) },
        },
        admin,
      )
    ).json().data.id;
    await postIdem(
      "/inventory/receipts",
      {
        storeId,
        lines: [{ productId: mixedProduct, qty: 5, costPrice: { amount: 100, currency: "USD" } }],
      },
      randomUUID(),
      admin,
    );

    const res = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId,
        lines: [{ productId: mixedProduct, qty: 1 }],
        payments: [{ method: "CASH", amount: money(200) }],
      },
      randomUUID(),
      admin,
    );
    expect(res.statusCode).toBe(400);
  });

  it("posts a balanced reversing journal entry for a partial POS refund", async () => {
    // Refund 1 of the 3 units: proportional revenue 1000, tax 50, COGS 600.
    const res = await postIdem(
      "/pos/sale-returns",
      {
        saleId: checkoutSaleId,
        cashSessionId,
        refundMethod: "CASH",
        reason: "test",
        lines: [{ productId, qty: 1 }],
      },
      randomUUID(),
      admin,
    );
    expect(res.statusCode).toBe(201);

    const entry = await journalEntryFor("sale_return", res.json().data.number);
    assertBalanced(entry);
    const cashId = await accountIdByCode(SYSTEM_ACCOUNTS.CASH);
    const revenueId = await accountIdByCode(SYSTEM_ACCOUNTS.SALES_REVENUE);
    const taxId = await accountIdByCode(SYSTEM_ACCOUNTS.TAX_PAYABLE);
    const cogsId = await accountIdByCode(SYSTEM_ACCOUNTS.COST_OF_GOODS_SOLD);
    const inventoryId = await accountIdByCode(SYSTEM_ACCOUNTS.INVENTORY);
    expect(entry.lines.find((l) => l.accountId === revenueId)).toMatchObject({
      debit: 1000,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === taxId)).toMatchObject({ debit: 50, credit: 0 });
    expect(entry.lines.find((l) => l.accountId === cashId)).toMatchObject({
      debit: 0,
      credit: 1050,
    });
    expect(entry.lines.find((l) => l.accountId === inventoryId)).toMatchObject({
      debit: 600,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === cogsId)).toMatchObject({
      debit: 0,
      credit: 600,
    });
  });

  it("rejects a sale refund when the product's current cost currency no longer matches the sale currency", async () => {
    const existing = (await get(`/catalog/products/${productId}`, admin)).json().data;
    const refundProduct = (
      await post(
        "/catalog/products",
        {
          sku: "SKU-ACC-REFCUR",
          name: "Refund Currency Widget",
          categoryId: existing.categoryId,
          unitId: existing.unitId,
          pricing: { costPrice: money(300), sellPrice: money(500) },
        },
        admin,
      )
    ).json().data.id;
    await postIdem(
      "/inventory/receipts",
      { storeId, lines: [{ productId: refundProduct, qty: 5, costPrice: money(300) }] },
      randomUUID(),
      admin,
    );
    const sale = await postIdem(
      "/pos/sales",
      {
        storeId,
        cashSessionId,
        lines: [{ productId: refundProduct, qty: 2 }],
        payments: [{ method: "CASH", amount: money(1000) }],
      },
      randomUUID(),
      admin,
    );
    expect(sale.statusCode).toBe(201);

    // The product's master cost is later re-denominated in USD — nothing ties a product's cost
    // currency to the store/sale currency at the schema level.
    await patch(
      `/catalog/products/${refundProduct}`,
      { pricing: { costPrice: { amount: 300, currency: "USD" }, sellPrice: money(500) } },
      admin,
    );

    const refund = await postIdem(
      "/pos/sale-returns",
      {
        saleId: sale.json().data.id,
        cashSessionId,
        refundMethod: "CASH",
        reason: "currency test",
        lines: [{ productId: refundProduct, qty: 1 }],
      },
      randomUUID(),
      admin,
    );
    expect(refund.statusCode).toBe(400);
  });

  it("posts a balanced journal entry for a purchase return (Dr Accounts Payable / Cr Inventory)", async () => {
    const res = await postIdem(
      "/purchasing/returns",
      { supplierId, storeId, reason: "damaged", lines: [{ productId, qty: 2 }] },
      randomUUID(),
      admin,
    );
    expect(res.statusCode).toBe(201);

    const entry = await journalEntryFor("purchase_return", res.json().data.number);
    assertBalanced(entry);
    const inventoryId = await accountIdByCode(SYSTEM_ACCOUNTS.INVENTORY);
    const payableId = await accountIdByCode(SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE);
    // 2 units restocked at the product's current cost (600) = 1200.
    expect(entry.lines.find((l) => l.accountId === payableId)).toMatchObject({
      debit: 1200,
      credit: 0,
    });
    expect(entry.lines.find((l) => l.accountId === inventoryId)).toMatchObject({
      debit: 0,
      credit: 1200,
    });
  });

  it("rejects a purchase return whose lines have inconsistent cost currency", async () => {
    const existing = (await get(`/catalog/products/${productId}`, admin)).json().data;
    const prodUsd = (
      await post(
        "/catalog/products",
        {
          sku: "SKU-ACC-PRUSD",
          name: "USD Cost Product",
          categoryId: existing.categoryId,
          unitId: existing.unitId,
          pricing: { costPrice: money(500), sellPrice: money(900) },
        },
        admin,
      )
    ).json().data.id;
    const prodBdt = (
      await post(
        "/catalog/products",
        {
          sku: "SKU-ACC-PRBDT",
          name: "BDT Cost Product",
          categoryId: existing.categoryId,
          unitId: existing.unitId,
          pricing: { costPrice: money(500), sellPrice: money(900) },
        },
        admin,
      )
    ).json().data.id;
    await postIdem(
      "/inventory/receipts",
      {
        storeId,
        lines: [{ productId: prodUsd, qty: 5, costPrice: { amount: 500, currency: "USD" } }],
      },
      randomUUID(),
      admin,
    );
    await postIdem(
      "/inventory/receipts",
      { storeId, lines: [{ productId: prodBdt, qty: 5, costPrice: money(500) }] },
      randomUUID(),
      admin,
    );

    const res = await postIdem(
      "/purchasing/returns",
      {
        supplierId,
        storeId,
        reason: "mixed currency test",
        lines: [
          { productId: prodUsd, qty: 1 },
          { productId: prodBdt, qty: 1 },
        ],
      },
      randomUUID(),
      admin,
    );
    expect(res.statusCode).toBe(400);
  });

  it("allows a read-only role to list/get accounts and journal entries but not create anything", async () => {
    expect((await get("/accounting/accounts", reader)).statusCode).toBe(200);
    expect((await get("/accounting/journal-entries", reader)).statusCode).toBe(200);
    expect((await get("/accounting/expenses", reader)).statusCode).toBe(200);

    const createAccount = await post(
      "/accounting/accounts",
      { code: "9999", name: "X", type: "ASSET" },
      reader,
    );
    expect(createAccount.statusCode).toBe(403);
  });

  it("denies all accounting access to a principal with no accounting permission", async () => {
    // "admin" has the wildcard; use a plain cashier (no ACCOUNTING_* permission at all).
    await seedUserWithRoleName("u-cashier-noacc", "cashier");
    const cashierToken = await sign("u-cashier-noacc");
    expect((await get("/accounting/accounts", cashierToken)).statusCode).toBe(403);
  });
});
