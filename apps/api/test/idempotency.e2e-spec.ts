process.env.MONGODB_URI ??= "mongodb://localhost:27017/supershop_test?replicaSet=rs0";
process.env.NODE_ENV = "test";

import { Body, Controller, Post } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  getModelToken,
  InjectModel,
  MongooseModule,
  Prop,
  Schema,
  SchemaFactory,
} from "@nestjs/mongoose";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { HydratedDocument, Model } from "mongoose";
import { validateEnv } from "../src/config/env";
import { CommonModule } from "../src/common/common.module";
import { DatabaseModule } from "../src/database/database.module";
import { CountersModule } from "../src/counters/counters.module";
import { CountersService } from "../src/counters/counters.service";
import { IdempotencyModule } from "../src/idempotency/idempotency.module";
import { Idempotent } from "../src/idempotency/idempotent.decorator";

@Schema({ collection: "orders_test" })
class OrderTest {
  @Prop({ required: true })
  number!: string;

  @Prop()
  sku!: string;
}
type OrderTestDocument = HydratedDocument<OrderTest>;
const OrderTestSchema = SchemaFactory.createForClass(OrderTest);

@Controller("test")
class TestController {
  constructor(
    @InjectModel(OrderTest.name) private readonly orders: Model<OrderTestDocument>,
    private readonly counters: CountersService,
  ) {}

  @Post("orders")
  @Idempotent()
  async create(@Body() body: { sku: string }): Promise<{ id: string; number: string }> {
    const number = await this.counters.nextFormatted("order-test", "ORD");
    const doc = await this.orders.create({ number, sku: body.sku });
    return { id: doc._id.toString(), number };
  }
}

describe("Idempotency interceptor (e2e)", () => {
  let app: NestFastifyApplication;
  let orders: Model<OrderTestDocument>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        CountersModule,
        IdempotencyModule,
        CommonModule,
        MongooseModule.forFeature([{ name: OrderTest.name, schema: OrderTestSchema }]),
      ],
      controllers: [TestController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    orders = app.get<Model<OrderTestDocument>>(getModelToken(OrderTest.name));
  });

  afterAll(async () => {
    await orders.db.dropDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await orders.deleteMany({});
    await orders.db.collection("counters").deleteMany({});
    await orders.db.collection("idempotency_keys").deleteMany({});
  });

  it("requires the Idempotency-Key header", async () => {
    const res = await app.inject({ method: "POST", url: "/test/orders", payload: { sku: "A" } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("replays the original result and creates no duplicate document", async () => {
    const headers = { "idempotency-key": "key-1" };

    const first = await app.inject({
      method: "POST",
      url: "/test/orders",
      headers,
      payload: { sku: "A" },
    });
    const second = await app.inject({
      method: "POST",
      url: "/test/orders",
      headers,
      payload: { sku: "A" },
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({
      success: true,
      data: { id: expect.any(String), number: "ORD-000001" },
    });

    // Identical body, replay header set, and exactly one document created.
    expect(second.json()).toEqual(first.json());
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(await orders.countDocuments()).toBe(1);
  });

  it("409s when the same key is reused with a different payload", async () => {
    const headers = { "idempotency-key": "key-2" };
    await app.inject({ method: "POST", url: "/test/orders", headers, payload: { sku: "A" } });
    const conflict = await app.inject({
      method: "POST",
      url: "/test/orders",
      headers,
      payload: { sku: "B" },
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });
});
