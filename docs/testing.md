# Testing

## Suites
| Command | What it covers | Needs |
|---|---|---|
| `npm run test:unit` | state machine, quantity/sign rules, permissions & visibility, CSV/audit sanitisers, env validation, test-DB guard, all Zod request schemas, OpenAPI 3.1 generation | nothing |
| `npm run test:db` | CHECK/UNIQUE/FK constraints, append-only triggers, concurrent stock deduction, rollback, idempotency races, concurrent decisions, request numbering — the **exact SQL strings used by the services**, via the `pg` driver | `TEST_DATABASE_URL` + migrations applied |
| `npm run test:integration` | full API journey and 18 security/concurrency scenarios through Express + Prisma | generated Prisma Client + `TEST_DATABASE_URL` + migrations |

## Safe test database
`TEST_DATABASE_URL` must name a database ending in `_test`, on localhost, or on a remote host only when
`ALLOW_REMOTE_TEST_DB=true`; it must differ from `DATABASE_URL`/`DIRECT_URL`. Otherwise every suite refuses to start.
Use a dedicated Neon branch/database for remote testing. The reset helper truncates data in that database only.

## Running
```bash
# 1. dedicated test database (Neon branch named e.g. cims_test, or any PostgreSQL you control)
export TEST_DATABASE_URL='postgresql://…/cims_test?sslmode=require'   # + ALLOW_REMOTE_TEST_DB=true if remote
# 2. apply migrations to it
DIRECT_URL="$TEST_DATABASE_URL" npm run migrate:deploy
# 3. run
npm run test:unit && npm run test:db && npm run test:integration
```
Sandbox shortcut used during authoring (throw-away local PostgreSQL 16, **not part of the product**):
`bash scripts/sandbox-db-reset.sh` recreates `cims_test` and applies the SQL migrations with `psql`.

## First things to do on your machine (not yet verified)
1. `npx prisma generate && npx prisma validate` — confirms `schema.prisma`.
2. **Drift check:** on an empty dev database run `npx prisma migrate deploy`, then
   `npx prisma migrate dev --create-only --name drift_check`. If Prisma wants to generate any SQL, the hand-written
   `0001_init` differs from the schema — send the generated SQL for reconciliation and delete the extra migration.
3. `npm run typecheck` — expect zero errors once the client exists; fix anything the missing client was hiding.
4. `npm run test:integration` — the 25 tests have never run.

## Results actually obtained so far
See the table in the root `README.md`. Unit: 55/55 pass. DB-level: 20/20 pass. Integration/security: 25 written, 0 executed.

## Pending
End-to-end browser tests (Playwright) wait for the frontend. Load/soak tests, backup/restore drills and Neon-specific
connection-pool behaviour are untested.
