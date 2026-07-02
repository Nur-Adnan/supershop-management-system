import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ConfigModule } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { type Model, Types } from "mongoose";
import { validateEnv } from "../src/config/env";
import { AuditModule } from "../src/audit/audit.module";
import { AuthModule } from "../src/auth/auth.module";
import { CatalogModule } from "../src/catalog/catalog.module";
import { CommonModule } from "../src/common/common.module";
import { CustomersModule } from "../src/customers/customers.module";
import { DatabaseModule } from "../src/database/database.module";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { Role } from "../src/roles/role.schema";
import { RolesModule } from "../src/roles/roles.module";
import { StoresModule } from "../src/stores/stores.module";
import { SuppliersModule } from "../src/suppliers/suppliers.module";
import { User } from "../src/users/user.schema";
import { UsersModule } from "../src/users/users.module";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;
const money = (amount: number) => ({ amount, currency: "BDT" });

describe("Master data (e2e — catalog/stores/suppliers/customers)", () => {
  let app: NestFastifyApplication;
  let server: Server;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let key: KeyPair;
  let jwksKeys: unknown[];
  let adminId: string;

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

  async function seedUser(sub: string, roleName: string): Promise<string> {
    const role = await roleModel.findOne({ name: roleName }).lean();
    const u = await userModel.create({
      supabaseId: sub,
      email: `${sub}@test.com`,
      roleId: role!._id,
      status: "active",
    });
    return String(u._id);
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  let admin: string;
  let cashier: string;

  // Thin helpers over app.inject with the admin token.
  const post = (url: string, body: unknown, token = admin) =>
    app.inject({ method: "POST", url, headers: bearer(token), payload: body as object });
  const get = (url: string, token = admin) =>
    app.inject({ method: "GET", url, headers: bearer(token) });
  const del = (url: string, token = admin) =>
    app.inject({ method: "DELETE", url, headers: bearer(token) });

  beforeAll(async () => {
    key = await generateKeyPair("RS256", { extractable: true });
    jwksKeys = [{ ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" }];
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ keys: jwksKeys }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_masterdata_test?replicaSet=rs0";
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
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    userModel = app.get<Model<User>>(getModelToken(User.name));
    roleModel = app.get<Model<Role>>(getModelToken(Role.name));
    await userModel.deleteMany({});
    adminId = await seedUser("u-admin", "super_admin");
    await seedUser("u-cashier", "cashier");
    admin = await sign("u-admin");
    cashier = await sign("u-cashier");
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

  // Shared taxonomy ids, created once and reused.
  let kgUnitId: string;
  let pieceUnitId: string;
  let categoryId: string;

  it("creates catalog taxonomy (unit/category/brand) and stamps createdBy", async () => {
    const kg = await post("/catalog/units", {
      name: "Kilogram",
      code: "kg",
      precision: 3,
      allowDecimal: true,
    });
    expect(kg.statusCode).toBe(201);
    expect(kg.json().data.id).toBeDefined();
    expect(kg.json().data.createdBy).toBe(adminId);
    kgUnitId = kg.json().data.id;

    const piece = await post("/catalog/units", { name: "Piece", code: "pc" });
    pieceUnitId = piece.json().data.id;
    expect(piece.json().data.allowDecimal).toBe(false);

    const cat = await post("/catalog/categories", { name: "Produce" });
    expect(cat.statusCode).toBe(201);
    categoryId = cat.json().data.id;

    const brand = await post("/catalog/brands", { name: "Acme" });
    expect(brand.statusCode).toBe(201);
  });

  it("rejects a duplicate unit code with 409 CONFLICT", async () => {
    const dup = await post("/catalog/units", { name: "Kilo again", code: "kg" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("CONFLICT");
  });

  it("rejects a weighted product on a non-decimal unit (400)", async () => {
    const res = await post("/catalog/products", {
      sku: "P-WEIGHTED-BAD",
      name: "Loose rice",
      categoryId,
      unitId: pieceUnitId,
      isWeighted: true,
      pricing: { costPrice: money(5000), sellPrice: money(6000) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a product referencing a non-existent category (400)", async () => {
    const res = await post("/catalog/products", {
      sku: "P-BADCAT",
      name: "Orphan",
      categoryId: new Types.ObjectId().toString(),
      unitId: pieceUnitId,
      pricing: { costPrice: money(100), sellPrice: money(200) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a weighted product on a decimal unit, with a barcode", async () => {
    const res = await post("/catalog/products", {
      sku: "P-RICE",
      barcodes: ["1000000001"],
      name: "Basmati rice",
      categoryId,
      unitId: kgUnitId,
      isWeighted: true,
      pricing: { costPrice: money(9000), sellPrice: money(12000), mrp: money(13000) },
      taxRateBps: 500,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.sku).toBe("P-RICE");
  });

  it("rejects a duplicate SKU and a duplicate barcode with 409", async () => {
    const dupSku = await post("/catalog/products", {
      sku: "P-RICE",
      name: "dup",
      categoryId,
      unitId: pieceUnitId,
      pricing: { costPrice: money(1), sellPrice: money(2) },
    });
    expect(dupSku.statusCode).toBe(409);

    const dupBarcode = await post("/catalog/products", {
      sku: "P-OTHER",
      barcodes: ["1000000001"],
      name: "dup barcode",
      categoryId,
      unitId: pieceUnitId,
      pricing: { costPrice: money(1), sellPrice: money(2) },
    });
    expect(dupBarcode.statusCode).toBe(409);
  });

  it("allows multiple products with NO barcodes (partial index, not sparse)", async () => {
    const a = await post("/catalog/products", {
      sku: "P-NOBARCODE-A",
      name: "No barcode A",
      categoryId,
      unitId: pieceUnitId,
      pricing: { costPrice: money(1), sellPrice: money(2) },
    });
    const b = await post("/catalog/products", {
      sku: "P-NOBARCODE-B",
      name: "No barcode B",
      categoryId,
      unitId: pieceUnitId,
      pricing: { costPrice: money(1), sellPrice: money(2) },
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
  });

  it("soft-deletes a product: excluded from list, 404 on read", async () => {
    const created = await post("/catalog/products", {
      sku: "P-TEMP",
      name: "Temp",
      categoryId,
      unitId: pieceUnitId,
      pricing: { costPrice: money(1), sellPrice: money(2) },
    });
    const id = created.json().data.id;

    const removed = await del(`/catalog/products/${id}`);
    expect(removed.statusCode).toBe(200);

    const gone = await get(`/catalog/products/${id}`);
    expect(gone.statusCode).toBe(404);

    const list = await get("/catalog/products?limit=100");
    const skus = (list.json().data as Array<{ sku: string }>).map((p) => p.sku);
    expect(skus).not.toContain("P-TEMP");
    expect(skus).toContain("P-RICE");
  });

  it("enforces pagination sort allow-list on products", async () => {
    const ok = await get("/catalog/products?sort=-sku&limit=2");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().meta).toMatchObject({ page: 1, limit: 2 });

    const bad = await get("/catalog/products?sort=barcodes");
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("bulk-imports products with a per-row result report", async () => {
    const res = await post("/catalog/products/bulk", {
      rows: [
        {
          sku: "BULK-1",
          name: "Bulk one",
          categoryId,
          unitId: pieceUnitId,
          pricing: { costPrice: money(10), sellPrice: money(20) },
        },
        {
          sku: "BULK-2",
          name: "Bulk two",
          categoryId,
          unitId: pieceUnitId,
          pricing: { costPrice: money(10), sellPrice: money(20) },
        },
        {
          sku: "P-RICE",
          name: "Rice updated",
          categoryId,
          unitId: kgUnitId,
          isWeighted: true,
          pricing: { costPrice: money(1), sellPrice: money(2) },
        },
        { sku: "BAD", name: "" }, // invalid: missing category/unit/pricing + empty name
      ],
    });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.total).toBe(4);
    expect(body.created).toBe(2);
    expect(body.updated).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.results.find((r: { sku: string }) => r.sku === "BAD").status).toBe("error");
  });

  it("blocks a cashier (catalog.read only) from writing but allows reading", async () => {
    const read = await get("/catalog/products", cashier);
    expect(read.statusCode).toBe(200);

    const write = await post("/catalog/units", { name: "x", code: "xx" }, cashier);
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe("FORBIDDEN");
  });

  it("creates stores and rejects a duplicate code (409)", async () => {
    const s = await post("/stores", { name: "Main", code: "MAIN", currency: "BDT" });
    expect(s.statusCode).toBe(201);
    expect(s.json().data.taxConfig).toMatchObject({ vatBps: 0, pricesIncludeTax: false });

    const dup = await post("/stores", { name: "Main 2", code: "MAIN" });
    expect(dup.statusCode).toBe(409);
  });

  it("creates a supplier with an opening balance in minor units", async () => {
    const res = await post("/suppliers", {
      name: "Global Foods",
      code: "GF",
      openingBalance: money(150000),
      contact: { phone: "0123", email: "gf@x.com" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.openingBalance).toEqual(money(150000));
  });

  it("creates customer groups + customers, validates group ref, enforces phone uniqueness", async () => {
    const group = await post("/customer-groups", { name: "VIP", discountBps: 500 });
    expect(group.statusCode).toBe(201);
    const groupId = group.json().data.id;

    const c = await post("/customers", {
      name: "Rahim",
      phone: "018000001",
      groupId,
      creditLimit: money(50000),
    });
    expect(c.statusCode).toBe(201);

    const badGroup = await post("/customers", {
      name: "No group",
      phone: "018000002",
      groupId: new Types.ObjectId().toString(),
    });
    expect(badGroup.statusCode).toBe(400);

    const dupPhone = await post("/customers", { name: "Dupe", phone: "018000001" });
    expect(dupPhone.statusCode).toBe(409);
  });
});
