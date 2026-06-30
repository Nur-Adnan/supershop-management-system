// Creates the core indexes from docs/SCHEMA.md. Collections are auto-created on first
// index. `down` drops all secondary indexes on the touched collections (this is the
// first migration, so that fully reverts it; the runtime schemas re-create system
// indexes on next app start).

const INDEXES = [
  // products
  { collection: "products", spec: { name: "text" }, options: { name: "products_name_text" } },
  { collection: "products", spec: { barcodes: 1 }, options: { unique: true, sparse: true } },
  { collection: "products", spec: { categoryId: 1, isActive: 1 } },
  // inventory (cache per product+store)
  { collection: "inventory", spec: { productId: 1, storeId: 1 }, options: { unique: true } },
  // stock batches (FEFO)
  { collection: "stock_batches", spec: { productId: 1, storeId: 1, expiryDate: 1 } },
  // stock movements (append-only ledger)
  { collection: "stock_movements", spec: { storeId: 1, createdAt: 1 } },
  { collection: "stock_movements", spec: { productId: 1, storeId: 1, createdAt: 1 } },
  { collection: "stock_movements", spec: { refType: 1, refId: 1 } },
  // sales
  { collection: "sales", spec: { storeId: 1, createdAt: 1 } },
  { collection: "sales", spec: { idempotencyKey: 1 }, options: { unique: true, sparse: true } },
  { collection: "sales", spec: { customerId: 1, createdAt: 1 } },
  // payments
  { collection: "payments", spec: { refType: 1, refId: 1 } },
  { collection: "payments", spec: { method: 1, createdAt: 1 } },
  // idempotency keys
  { collection: "idempotency_keys", spec: { key: 1 }, options: { unique: true } },
  { collection: "idempotency_keys", spec: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  // counters
  { collection: "counters", spec: { name: 1 }, options: { unique: true } },
];

module.exports = {
  async up(db) {
    for (const { collection, spec, options } of INDEXES) {
      await db.collection(collection).createIndex(spec, options || {});
    }
  },

  async down(db) {
    const collections = [...new Set(INDEXES.map((i) => i.collection))];
    for (const name of collections) {
      try {
        await db.collection(name).dropIndexes();
      } catch (err) {
        // Collection may not exist yet — ignore.
        if (err && err.codeName !== "NamespaceNotFound") throw err;
      }
    }
  },
};
