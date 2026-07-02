// Phase 6 purchasing (PO -> GRN -> purchase returns). Seeds the business-number counters so
// CountersService.next() inside a posting transaction never races on the first upsert.

const INDEXES = [
  { collection: "purchase_orders", spec: { number: 1 }, options: { unique: true } },
  { collection: "purchase_orders", spec: { supplierId: 1, createdAt: -1 } },
  { collection: "purchase_orders", spec: { storeId: 1, status: 1 } },
  { collection: "goods_receipts", spec: { number: 1 }, options: { unique: true } },
  { collection: "goods_receipts", spec: { poId: 1, createdAt: -1 } },
  { collection: "goods_receipts", spec: { storeId: 1, createdAt: -1 } },
  { collection: "purchase_returns", spec: { number: 1 }, options: { unique: true } },
  { collection: "purchase_returns", spec: { supplierId: 1, createdAt: -1 } },
  { collection: "purchase_returns", spec: { storeId: 1, createdAt: -1 } },
];

const COUNTERS = ["purchase_order", "goods_receipt", "purchase_return"];

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
