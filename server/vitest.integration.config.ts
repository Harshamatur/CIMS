import { defineConfig } from "vitest/config";
// API integration + security tests. Require a generated Prisma Client and TEST_DATABASE_URL.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ["tests/helpers/setup-env.ts"],
  },
});
