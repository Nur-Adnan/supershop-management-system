// migrate-mongo reads this from the apps/api working dir.
const config = {
  mongodb: {
    url: process.env.MONGODB_URI || "mongodb://localhost:27017/supershop?replicaSet=rs0",
    databaseName: process.env.MONGO_DB_NAME || "supershop",
    options: {},
  },
  migrationsDir: "migrations",
  changelogCollectionName: "migrations_changelog",
  lockCollectionName: "migrations_changelog_lock",
  // Stale-lock auto-expiry (seconds). Required: migrate-mongo creates a TTL index from it,
  // and a missing value serializes to expireAfterSeconds:null (CannotCreateIndex).
  lockTtl: 90,
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: "commonjs",
};

module.exports = config;
