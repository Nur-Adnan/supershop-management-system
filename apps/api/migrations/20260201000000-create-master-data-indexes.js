// Phase 4 master-data indexes. Mirrors the unique/index declarations on the Mongoose schemas
// so production (autoIndex off) matches what dev/test build automatically. `products.sku` and the
// partial `products.barcodes` unique live in the core-indexes migration; here are the rest.
//
// Note: unique keys are NOT partial on `deletedAt` — a soft-deleted master record keeps its code
// reserved (historical integrity). Switch to a partialFilterExpression: { deletedAt: null } if
// reuse-after-delete is ever required.

const INDEXES = [
  { collection: "units", spec: { code: 1 }, options: { unique: true } },
  { collection: "brands", spec: { name: 1 }, options: { unique: true } },
  { collection: "categories", spec: { parentId: 1 } },
  { collection: "stores", spec: { code: 1 }, options: { unique: true } },
  { collection: "suppliers", spec: { code: 1 }, options: { unique: true, sparse: true } },
  { collection: "customers", spec: { phone: 1 }, options: { unique: true, sparse: true } },
  { collection: "customer_groups", spec: { name: 1 }, options: { unique: true } },
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
        // Index or collection may not exist — ignore those, surface anything else.
        if (err && err.codeName !== "IndexNotFound" && err.codeName !== "NamespaceNotFound")
          throw err;
      }
    }
  },
};
