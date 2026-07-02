// Phase 9 promotions & loyalty. No new counters — promotion codes are user-supplied (unique,
// not sequential) and loyalty_transactions has no own `number`, mirroring stock_movements
// (refType/refId point back to the sale that caused each entry).

const INDEXES = [
  { collection: "promotions", spec: { code: 1 }, options: { unique: true } },
  { collection: "promotions", spec: { validFrom: 1, validTo: 1 } },
  { collection: "loyalty_transactions", spec: { customerId: 1, createdAt: -1 } },
  { collection: "loyalty_transactions", spec: { refType: 1, refId: 1 } },
];

module.exports = {
  async up(db) {
    for (const { collection, spec, options } of INDEXES) {
      await db.collection(collection).createIndex(spec, options || {});
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
  },
};
