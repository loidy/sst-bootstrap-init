import type { Config } from "jest";
// Extension required: `next` ships no `exports` map, so ESM can't resolve `next/jest`.
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig: Config = {
  testEnvironment: "node",
  testMatch: ["**/*.test.{ts,tsx}"],
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@bootstrap/database$": "<rootDir>/database/index.ts",
    "^@bootstrap/database/client$": "<rootDir>/database/client.ts",
    "^@bootstrap/database/server$": "<rootDir>/database/server.ts",
  },
};

export default createJestConfig(customJestConfig);
