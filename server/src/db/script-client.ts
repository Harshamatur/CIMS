import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/**
 * Prisma client for one-off scripts (seed, admin bootstrap). Prefers the DIRECT (non-pooled) URL.
 * Never prints the connection string.
 */
export function createScriptPrisma(): PrismaClient {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set DIRECT_URL (preferred) or DATABASE_URL in your environment / .env file.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
