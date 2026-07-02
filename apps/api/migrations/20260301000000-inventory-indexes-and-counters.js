// Phase 5 inventory. Core inventory/stock_batches/stock_movements indexes already live in the
// core-indexes migration; here are the adjustment/transfer header indexes plus seeding of the
// business-number counters so `CountersService.next()` inside a transaction never races on the
// first upsert (the counter doc already exists).

const INDEXES = [
  { collection: "stock_adjustments", spec: { number: 1 }, options: { unique: true } },
  { collection: "stock_adjustments", spec: { storeId: 1, createdAt: -1 } },
  { collection: "stock_transfers", spec: { number: 1 }, options: { unique: true } },
  { collection: "stock_transfers", spec: { fromStoreId: 1, createdAt: -1 } },
  { collection: "stock_transfers", spec: { toStoreId: 1, createdAt: -1 } },
];

const COUNTERS = ["stock_receipt", "stock_adjustment", "stock_transfer"];

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
