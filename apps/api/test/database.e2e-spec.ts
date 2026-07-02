process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/supershop_test?replicaSet=rs0";
process.env.NODE_ENV = "test";

import { Prop, Schema, SchemaFactory, MongooseModule, getModelToken } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import type { HydratedDocument, Model } from "mongoose";
import { validateEnv } from "../src/config/env";
import { DatabaseModule } from "../src/database/database.module";
import { TransactionService } from "../src/database/transaction.service";
import { CountersModule } from "../src/counters/counters.module";
import { CountersService } from "../src/counters/counters.service";

@Schema({ collection: "widgets_test" })
class Widget {
  @Prop()
  name!: string;
}
type WidgetDocument = HydratedDocument<Widget>;
const WidgetSchema = SchemaFactory.createForClass(Widget);

describe("Database / transactions / counters (e2e against replica set)", () => {
  let app: TestingModule;
  let txn: TransactionService;
  let counters: CountersService;
  let widget: Model<WidgetDocument>;

  beforeAll(async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_test?replicaSet=rs0";
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        CountersModule,
        MongooseModule.forFeature([{ name: Widget.name, schema: WidgetSchema }]),
      ],
    }).compile();

    txn = app.get(TransactionService);
    counters = app.get(CountersService);
    widget = app.get<Model<WidgetDocument>>(getModelToken(Widget.name));
  });

  afterAll(async () => {
    await widget.db.dropDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await widget.deleteMany({});
    await widget.db.collection("counters").deleteMany({});
  });

  it("rolls back ALL writes when the transaction throws mid-operation", async () => {
    await expect(
      txn.withTransaction(async (session) => {
        await widget.create([{ name: "a" }], { session });
        await widget.create([{ name: "b" }], { session });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await widget.countDocuments()).toBe(0);
  });

  it("commits all writes when the transaction succeeds", async () => {
    await txn.withTransaction(async (session) => {
      await widget.create([{ name: "a" }], { session });
      await widget.create([{ name: "b" }], { session });
    });
    expect(await widget.countDocuments()).toBe(2);
  });

  it("nextSequence is collision-free under concurrency (50 parallel calls)", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => counters.next("seq-test")));
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(new Set(results).size).toBe(50);
  });

  it("formats business numbers as PREFIX-YEAR-000NNN", async () => {
    const num = await counters.nextFormatted("inv-2026", "INV", { year: 2026 });
    expect(num).toBe("INV-2026-000001");
  });
});
