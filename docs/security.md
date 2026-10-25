# Security

## Implemented controls
| Control | Where |
|---|---|
| Argon2id password hashing (19 MiB, t=2, p=1); timing equalised for unknown users | `common/password.ts`, `auth.service.ts` |
| Server-side sessions in PostgreSQL; cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production; session regenerated on login (fixation); destroyed on logout | `middleware/session.ts`, `auth.service.ts` |
| User re-loaded on **every** request — deactivation/role change applies immediately; sessions also purged | `middleware/auth.ts`, `users.service.ts` |
| CSRF: session-bound token (constant-time compare) + Origin check on all non-GET requests | `middleware/csrf.ts` |
| Login rate limit per IP; coarse global limiter | `middleware/rate-limit.ts` |
| Uniform login failure (unknown / wrong password / inactive / locked) | `auth.service.ts` |
| RBAC on every route, plus object-level visibility in the query `WHERE` (404 for foreign objects) | `api-router.ts`, `permissions.ts` |
| Zod validation of params/query/body/headers; `strictObject` bodies block mass assignment; 100 kB body limit; page size ≤ 100 | `*.schemas.ts` |
| SQL: Prisma + bound-parameter raw SQL only; LIKE wildcards escaped | services |
| helmet, CORS pinned to `APP_ORIGIN`, `x-powered-by` off | `app.ts` |
| Safe errors: no stack/SQL in responses; correlation id; log redaction of cookies/CSRF/passwords | `error-handler.ts`, `logger.ts` |
| Audit sanitiser strips password/hash/token/session/secret keys | `audit-sanitize.ts` |
| CSV formula-injection neutralisation, export cap 10 000 rows | `csv.ts` |
| Env validated at start-up; messages name variables, never values | `config/env.ts` |
| Test-database guard (`*_test`, local host unless explicitly allowed, ≠ app URLs) | `db-safety.ts` |
| No default or backdoor credentials; first admin via `admin:create`; seed needs `SEED_DEMO_PASSWORD`, refused in production | `scripts/`, `prisma/seed.ts` |

## Known limitations (prototype)
- Rate limiter is in-memory (per instance); use a shared store behind multiple instances.
- No MFA, password-change self-service, account-lockout policy, or password breach screening.
- Append-only is enforced by triggers; a privileged DB role can disable them. Use a restricted application role and
  consider shipping audit rows to external write-once storage.
- Audit rows are not hash-chained.
- No malware scanning / file uploads exist. No e-mail/SMS notifications exist.
- `SameSite=Lax` assumes the frontend is same-site with the API (same registrable domain). Cross-site deployment needs
  a design review (`SameSite=None; Secure` and stricter CSRF handling).
- Dependency audit (`npm audit`) reported 0 vulnerabilities at install time; re-run in CI regularly.
- **Not verified at runtime in the authoring environment** (Prisma could not run): every control above that lives in
  the Express/Prisma layer is implemented but unproven until the integration suite is executed.

## Database least privilege
Create two roles: a **migration** role (DDL, used with `DIRECT_URL`) and an **application** role (`SELECT/INSERT/UPDATE`
on tables, **no** `DELETE`/`TRUNCATE` on `stock_transactions`/`audit_logs`, no DDL, `USAGE` on `request_number_seq`,
`SELECT/INSERT/UPDATE/DELETE` on `session`). Use the application role in `DATABASE_URL`.

## Before any real use
Independent security review, penetration test, backup/restore drill, infrastructure and data-protection approval,
organisational acceptance testing, and confirmation of every business rule marked as an assumption in `architecture.md`.
