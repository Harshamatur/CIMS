# CIMS — Chemical Inventory and Issue Management System

A **fictional proof-of-work prototype** of a chemical inventory, requisition, approval and issue workflow for an
industrial Chemistry Division. It is **not** an officially approved, certified or production-ready system, and all
bundled data is invented demonstration data.

The repository contains the **backend** (`server/`) and the **core-journey frontend** (`client/`: login, request, approve, issue). Reports, audit, stock administration and the PWA layer are later phases. See `client/README.md` to run the UI and `docs/frontend-*.md` for its design and API mapping.

## Verification status (read this first)

| Area | Status |
|---|---|
| Pure business rules (state machine, quantities, permissions, CSV/audit sanitising, env validation, Zod schemas, OpenAPI builder) | **Executed:** 55 unit tests pass |
| PostgreSQL schema: hand-written SQL migrations, 19 CHECK constraints, composite FKs, append-only triggers | **Executed** on a local throw-away PostgreSQL 16.15: migrations apply cleanly |
| SQL-level constraint and concurrency behaviour (the exact SQL the services use, via the `pg` driver) | **Executed:** 20 DB tests pass |
| ESLint, Prettier | **Executed:** clean |
| TypeScript strict type-check | **Partially verified:** the only root error is the missing generated Prisma Client; ~53 further errors are `any` cascades from it. Code that depends on the client has **not** been type-checked |
| `prisma generate / validate / migrate`, Prisma-based services, the Express app at runtime | **NOT verified** — Prisma's engine host (`binaries.prisma.sh`) was unreachable in the authoring sandbox |
| API integration + security suites (25 tests, `tests/integration`, `tests/security`) | **Written, NOT executed** (auto-skipped without a generated client) |
| Frontend (`client/`): type-check, lint, production build, 51 unit/screen tests against a **mocked** `fetch` | **Executed** in the authoring sandbox |
| Frontend against the real backend (full journey in a browser) | **NOT verified** here; run it on your machine (`client/README.md`) |
| Neon connectivity, deployment | **NOT verified** (documented only) |
| Whether `0001_init` matches what `prisma migrate dev` would generate | **NOT verified** — see `docs/testing.md` for the drift check you must run first |

## Quick start

Prerequisites: Node.js 22 LTS, a Neon account. **No local PostgreSQL is required.**

```bash
cd server
npm ci
cp ../.env.example .env          # then edit .env (placeholders only in the example)
npx prisma generate              # creates src/generated/prisma (git-ignored)
npx prisma validate
npm run migrate:deploy           # applies prisma/migrations using DIRECT_URL
SEED_DEMO_PASSWORD='choose-a-long-password' npm run db:seed    # optional fictional demo data
npm run dev                      # http://localhost:3000   Swagger UI: http://localhost:3000/docs
```

Create the first real administrator (instead of, or after, the demo seed):

```bash
ADMIN_EMPLOYEE_CODE=ADM-001 ADMIN_FULL_NAME="Your Name" ADMIN_EMAIL=you@example.org npm run admin:create
# password: ADMIN_BOOTSTRAP_PASSWORD env var, or a hidden interactive prompt
```

### Neon setup

1. Create a Neon project and database in the Neon console.
2. Open the project's connection details. Neon offers a **pooled** connection (host contains `-pooler`) and a
   **direct** connection. Copy both.
3. Put the pooled URL in `DATABASE_URL` (runtime) and the direct URL in `DIRECT_URL` (migrations, seed, admin script)
   in `server/.env`. Keep `sslmode=require`. Never commit `.env`; never paste credentials into chat or issues.
4. `npm run migrate:deploy`, then `curl localhost:3000/ready` should return `{"status":"ready"}`.
5. For tests create a **separate** Neon branch/database whose name ends in `_test` (see `docs/testing.md`).

## Scripts (`server/`)

`dev` · `build` · `start` · `typecheck` · `lint` · `format` · `format:check` · `test` · `test:unit` · `test:db` ·
`test:integration` · `prisma:generate` · `prisma:validate` · `migrate:deploy` · `migrate:status` · `db:seed` ·
`admin:create` · `openapi:export`

## Documentation

`docs/architecture.md` · `docs/database-design.md` · `docs/api-reference.md` · `docs/business-workflows.md` ·
`docs/security.md` · `docs/testing.md` · `docs/deployment.md`. The OpenAPI 3.1 document is served at
`/api/v1/openapi.json` and Swagger UI at `/docs` (both disabled in production unless `SWAGGER_ENABLED=true`).

## Key rules implemented

Three roles (`EMPLOYEE`, `ADMIN`, `STOREKEEPER`) · approval and physical issue are separate steps · no self-approval ·
no stock reservation on submission · no over-approval or over-issue · stock can never go negative (conditional update
+ CHECK constraint) · issue is atomic and idempotent (`Idempotency-Key`) · append-only stock ledger and audit log ·
authorization enforced on the server for every route · unknown or foreign resources return 404.
