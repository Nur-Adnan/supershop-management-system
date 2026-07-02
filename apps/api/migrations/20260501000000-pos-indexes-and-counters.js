// Phase 7 POS (cash sessions -> checkout -> sale returns). Seeds the business-number counters so
// CountersService.next() inside a posting transaction never races on the first upsert.

const INDEXES = [
  {
    collection: "cash_sessions",
    spec: { storeId: 1, terminalId: 1 },
    options: { unique: true, partialFilterExpression: { status: "OPEN" } },
  },
  { collection: "cash_sessions", spec: { storeId: 1, createdAt: -1 } },
  { collection: "cash_transactions", spec: { sessionId: 1, createdAt: 1 } },
  { collection: "payments", spec: { refType: 1, refId: 1 } },
  { collection: "payments", spec: { method: 1, createdAt: 1 } },
  { collection: "sales", spec: { number: 1 }, options: { unique: true } },
  { collection: "sales", spec: { storeId: 1, createdAt: -1 } },
  { collection: "sales", spec: { customerId: 1, createdAt: -1 } },
  { collection: "sale_returns", spec: { number: 1 }, options: { unique: true } },
  { collection: "sale_returns", spec: { saleId: 1, createdAt: -1 } },
  { collection: "sale_returns", spec: { storeId: 1, createdAt: -1 } },
];

const COUNTERS = ["sale", "sale_return"];

module.exports = {
  async up(db) {
    for (const { collection, spec, options } of INDEXES) {
      await db.collection(collection).createIndex(spec, options || {});
    }
    for (const name of COUNTERS) {
      await db
        .collection("counters")
        .updateOne({ name }, { $setOnInsert: { seq: 0 } }, { upsert: true });
    }
  },

  async down(db) {
    for (const { collection, spec } of INDEXES) {
      try {
        await db.collection(collection).dropIndex(spec);
      } catch (err) {
        if (err && err.codeName !== "IndexNotFound" && err.codeName !== "NamespaceNotFound")
          throw err;
      }
    }
    await db.collection("counters").deleteMany({ name: { $in: COUNTERS } });
  },
};
