import { ConfigModule } from "@nestjs/config";
import { getModelToken, MongooseModule, Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Test, type TestingModule } from "@nestjs/testing";
import type { HydratedDocument, Model } from "mongoose";
import { validateEnv } from "../src/config/env";
import { AuditLog, type AuditLogDocument } from "../src/audit/audit-log.schema";
import { AuditModule } from "../src/audit/audit.module";
import { AuditService } from "../src/audit/audit.service";
import { DatabaseModule } from "../src/database/database.module";
import { TransactionService } from "../src/database/transaction.service";

@Schema({ collection: "things_test" })
class Thing {
  @Prop()
  name!: string;
}
type ThingDocument = HydratedDocument<Thing>;
const ThingSchema = SchemaFactory.createForClass(Thing);

describe("Audit (e2e — in-transaction diff + immutability)", () => {
  let ref: TestingModule;
  let txn: TransactionService;
  let audit: AuditService;
  let auditModel: Model<AuditLogDocument>;
  let thing: Model<ThingDocument>;

  beforeAll(async () => {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/supershop_audit_test?replicaSet=rs0";
    ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        AuditModule,
        MongooseModule.forFeature([{ name: Thing.name, schema: ThingSchema }]),
      ],
    }).compile();

    txn = ref.get(TransactionService, { strict: false });
    audit = ref.get(AuditService, { strict: false });
    auditModel = ref.get<Model<AuditLogDocument>>(getModelToken(AuditLog.name), { strict: false });
    thing = ref.get<Model<ThingDocument>>(getModelToken(Thing.name), { strict: false });
  });

  afterAll(async () => {
    await auditModel.db.dropDatabase();
    await ref.close();
  });

  beforeEach(async () => {
    await thing.deleteMany({});
    // audit_logs is immutable via Mongoose middleware; clean it through the native driver.
    await auditModel.collection.deleteMany({});
  });

  it("writes an immutable audit record with a before/after diff, atomically", async () => {
    const t = await thing.create({ name: "old" });
    await txn.withTransaction(async (session) => {
      await thing.updateOne({ _id: t._id }, { $set: { name: "new" } }, { session });
      await audit.record(
        {
          action: "thing.rename",
          entityType: "Thing",
          entityId: String(t._id),
          before: { name: "old" },
          after: { name: "new" },
        },
        session,
      );
    });

    const logs = await auditModel.find({ action: "thing.rename" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.changes).toEqual({ name: { from: "old", to: "new" } });
    expect(await thing.findById(t._id)).toMatchObject({ name: "new" });
  });

  it("rolls back the audit record together with the mutation", async () => {
    const t = await thing.create({ name: "keep" });
    await expect(
      txn.withTransaction(async (session) => {
        await thing.updateOne({ _id: t._id }, { $set: { name: "changed" } }, { session });
        await audit.record(
          { action: "thing.fail", entityType: "Thing", entityId: String(t._id) },
          session,
        );
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await auditModel.countDocuments({ action: "thing.fail" })).toBe(0);
    expect(await thing.findById(t._id)).toMatchObject({ name: "keep" });
  });

  it("rejects updates and deletes of audit records (append-only)", async () => {
    await audit.record({ action: "thing.locked", entityType: "Thing", entityId: "x" });
    const doc = await auditModel.findOne({ action: "thing.locked" });

    await expect(
      auditModel.updateOne({ _id: doc!._id }, { $set: { action: "tampered" } }).exec(),
    ).rejects.toThrow(/immutable/);
    await expect(
      auditModel.findOneAndUpdate({ _id: doc!._id }, { $set: { action: "x" } }).exec(),
    ).rejects.toThrow(/immutable/);
    await expect(auditModel.deleteOne({ _id: doc!._id }).exec()).rejects.toThrow(/immutable/);

    // Also blocks an aggregate $out that would rewrite the whole collection.
    await expect(
      auditModel.aggregate([{ $match: {} }, { $out: "audit_logs" }]).exec(),
    ).rejects.toThrow(/immutable/);
  });
});
