/** Writes docs/openapi.json from the live route catalog. Needs the generated Prisma Client (route modules import it). */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.APP_ORIGIN ??= "http://localhost:5173";
process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@localhost:5432/placeholder";
process.env.SESSION_SECRET ??= "openapi-export-only-not-a-real-secret-0000";

const { buildApi } = await import("../src/app.js");
const { buildOpenApiDocument } = await import("../src/openapi/build.js");
const doc = buildOpenApiDocument(buildApi(false).catalog);
const target = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/openapi.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(doc, null, 2) + "\n");
console.log(`Wrote ${target} (${Object.keys(doc.paths ?? {}).length} paths)`);
