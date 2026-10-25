# Architecture

## Layers
`routes (ApiRouter) -> validation (Zod) -> service (business rules, transactions) -> Prisma / parameterised SQL -> PostgreSQL (Neon)`.

- **`common/api-router.ts`** is the single place where a route is declared. One declaration provides the Express
  handler, authentication, role check, Zod validation of params/query/body/headers, the response envelope and the
  OpenAPI entry — so the documentation cannot drift from behaviour. In `NODE_ENV=test` every response is also checked
  against its declared schema.
- **Services** hold business rules. Anything that changes related records runs in one `prisma.$transaction`, and the
  audit row is written inside the same transaction.
- **Pure modules** (`common/state-machine.ts`, `quantity.ts`, `permissions.ts`, `csv.ts`, `audit-sanitize.ts`,
  `db-safety.ts`) have no I/O and are fully unit-tested.
- **Stock SQL** (`modules/stock-transactions/sql.ts`) is the single source of truth for conditional stock updates,
  row locks and request numbering. The services run it via `$executeRawUnsafe` **with bound parameters**; the DB
  tests run the identical strings through the `pg` driver.

## Modules
`auth` (login/logout/session, CSRF token) · `users` · `chemicals` (master data + pack sizes) · `inventory` (balances,
thresholds) · `requests` (draft/submit/cancel/list/detail) · `approvals` (approve/reject) · `stock-transactions`
(receipts, adjustments, reversals, ledger, **issue**) · `reports` (JSON + CSV) · `audit` · `health` (`/health`, `/ready`).

## Cross-cutting
Request/correlation id (`X-Request-Id`) · pino structured logs with redaction · helmet · CORS pinned to `APP_ORIGIN` ·
PostgreSQL-backed sessions (`connect-pg-simple`) · session-bound CSRF token + Origin check · per-IP login rate limit
and a coarse global limiter · uniform error envelope `{ error: { code, message, fieldErrors?, requestId } }`.

## Decisions and deviations
| Decision | Reason |
|---|---|
| Prisma 7.10.1 with `prisma.config.ts` + `@prisma/adapter-pg` | Latest stable (8.x is a release candidate). Prisma 7 no longer takes URLs in `schema.prisma`; migrations use `DIRECT_URL`, runtime uses the pooled `DATABASE_URL`. |
| Hand-authored `0001_init` / `0002_integrity` SQL | Prisma CLI could not run in the authoring sandbox. `0002` holds CHECKs, sequence and triggers that Prisma cannot express. **Verify drift on your machine.** |
| `request_number` nullable until submission | Drafts have no number yet; a CHECK requires it for every non-draft status. |
| Exactly one `approval_actions` row per request (UNIQUE) | Prototype policy; second decisions are impossible even if service logic regressed. |
| Quantities are integer **packs**, not litres/kilograms | Matches the existing page (stock shown per pack size). `base_quantity` describes one pack; it is never summed or converted across units. |
| `reserved_quantity` kept but always 0 | Reservation on submission is intentionally not implemented; `available = on_hand - reserved` is still defined and constrained. |
| Reversal of ISSUE transactions unsupported | Would need to unwind request items and status; use a justified adjustment instead. |
| Admins do not issue by default | Separation of duties; `ALLOW_ADMIN_ISSUE=true` opts in. |
| `STOREKEEPER` role added | Physical hand-over is a distinct duty from approval. |
| No department model | "Departmental" review scoping is not implemented; all submitted requests are visible to every ADMIN. |
