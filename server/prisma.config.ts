import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 configuration. Migrations/CLI use the DIRECT (non-pooled) Neon URL.
// The runtime app uses DATABASE_URL through a driver adapter (src/db/client.ts).
// Values are read lazily so that `prisma generate` works without a database.
const migrationUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: migrationUrl },
});
