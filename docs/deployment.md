# Deployment (Neon + a Node.js host)

> Nothing here has been executed against Neon or a hosting provider. Treat it as a checklist to verify.

## 1. Neon
1. Create a project/database. Copy the pooled and direct connection strings from the project's connection details.
2. Create roles per `security.md` (migration role vs. application role) and use the application role in `DATABASE_URL`.
3. Use a Neon branch for staging/tests; keep production data on the main branch with point-in-time restore enabled
   according to your Neon plan.

## 2. Environment variables (set in the host's secret store, never in git)
`NODE_ENV=production` · `PORT` · `APP_ORIGIN` (https) · `DATABASE_URL` (pooled) · `DIRECT_URL` (direct, only where
migrations run) · `SESSION_SECRET` (≥ 32 random chars; rotating it logs everyone out) · `TRUST_PROXY=1` behind one proxy ·
`SESSION_TTL_HOURS` · `LOG_LEVEL` · `SWAGGER_ENABLED=false` · `ALLOW_ADMIN_ISSUE` · login rate-limit variables.
See `.env.example`. The frontend bundle must contain **no** database or session secrets.

## 3. Build and release
```bash
cd server && npm ci && npx prisma generate && npm run build      # outputs dist/
```
Start command `npm start`. Health probes: `GET /health` (liveness), `GET /ready` (database reachable; generic 503 otherwise).

## 4. Migrations (controlled step, not on app start)
Run `npm run migrate:deploy` from CI/CD or a one-off job **before** switching traffic, with `DIRECT_URL` set. Create a
Neon branch or restore point first. Migrations are forward-only; plan expand/contract changes so the previous app
version keeps working during the rollout.

## 5. First administrator
Run `npm run admin:create` once (hidden password prompt or `ADMIN_BOOTSTRAP_PASSWORD` from the secret store, then unset it).
**Do not run `db:seed` in production** (it refuses unless `ALLOW_DEMO_SEED=true`; use only on throw-away demo databases).

## 6. Hosting notes
- Serve API and frontend from the same site (same registrable domain) over HTTPS; cookies are `SameSite=Lax; Secure`.
- Behind a proxy set `TRUST_PROXY` correctly or rate limiting and audit IPs will be wrong.
- One instance is the tested assumption (in-memory rate limiter). Scale-out needs a shared limiter store.
- Logs are JSON on stdout (pino); cookies, CSRF tokens and passwords are redacted. Forward them to your log service.

## 7. Backup, recovery, rollback
- Rely on Neon point-in-time restore/branching; rehearse a restore and record the RPO/RTO you actually achieve.
- App rollback: redeploy the previous build (safe if the last migration was backward compatible).
- Failed migration: stop the rollout, restore from the pre-migration branch/restore point, fix forward.

## 8. GitHub Actions
`.github/workflows/ci.yml` runs generate, validate, typecheck, lint, format check, unit tests, migrations on a service
PostgreSQL 16, DB tests, integration tests, build and OpenAPI export. **Not yet run.** Add deployment as a separate,
manually approved workflow with environment secrets.

## 9. Production gate
Security review, penetration test, backup/restore drill, infrastructure and data-protection approval, acceptance
testing by the department, and confirmation of the assumed business rules.
