import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { getEnv } from "../config/env.js";

/** Either the root client or an interactive-transaction client. */
export type Tx = Prisma.TransactionClient;
export type InputJson = Prisma.InputJsonValue;
export type { PrismaClient };

let prisma: PrismaClient | undefined;
let pool: pg.Pool | undefined;

/** Prisma 7 requires a driver adapter. DATABASE_URL should be the Neon POOLED connection string. */
export function getPrisma(): PrismaClient {
  prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }) });
  return prisma;
}

/** Small dedicated pool for the session store (connect-pg-simple speaks to `pg` directly). */
export function getSessionPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getEnv().DATABASE_URL, max: 5 });
  return pool;
}

export async function disconnectDb(): Promise<void> {
  await Promise.allSettled([prisma?.$disconnect(), pool?.end()]);
  prisma = undefined;
  pool = undefined;
}
