/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  testTimeout: 30000,
  // External resources (jose JWKS keep-alive sockets, mongo) can linger past teardown.
  forceExit: true,
};
