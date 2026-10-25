import { defineConfig } from "vitest/config";
// SQL-level tests against an isolated PostgreSQL test database (TEST_DATABASE_URL). No Prisma required.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
