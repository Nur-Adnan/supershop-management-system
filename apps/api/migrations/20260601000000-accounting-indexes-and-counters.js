// Phase 8 accounting (chart of accounts -> journal entries -> expenses). Seeds the business-
// number counter for journal entries so CountersService.next() inside a posting transaction never
// races on the first upsert. The chart of accounts itself is seeded idempotently by
// AccountsService.onApplicationBootstrap on every boot (app-level, mirrors RolesService), not here.

const INDEXES = [
  { collection: "accounts", spec: { code: 1 }, options: { unique: true } },
  { collection: "accounts", spec: { parentId: 1 } },
  { collection: "accounts", spec: { type: 1 } },
  { collection: "journal_entries", spec: { number: 1 }, options: { unique: true } },
  { collection: "journal_entries", spec: { refType: 1, refId: 1 } },
  { collection: "journal_entries", spec: { date: -1 } },
  { collection: "journal_entries", spec: { "lines.accountId": 1, date: -1 } },
  { collection: "expenses", spec: { accountId: 1, createdAt: -1 } },
  { collection: "expenses", spec: { storeId: 1, createdAt: -1 } },
];

const COUNTERS = ["journal_entry"];

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
