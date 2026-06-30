import base from "@supershop/config-eslint";

export default [
  ...base,
  // CommonJS operational scripts (migrate-mongo); not part of the typed app.
  { ignores: ["migrations/**", "migrate-mongo-config.js"] },
];
