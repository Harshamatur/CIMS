# CIMS client (core journey)

Fictional proof-of-work prototype UI: sign in → search chemicals → multi-item request → administrator approve/reject →
storekeeper records the physical issue → everyone sees the live status.

## Run (two terminals)

```powershell
# 1. backend (see ../README.md for Neon setup, migrations and creating users)
cd server
npm run dev                      # http://localhost:3000   (APP_ORIGIN in server/.env must be http://localhost:5173)

# 2. frontend
cd client
npm ci
npm run dev                      # http://localhost:5173
```

Open http://localhost:5173 and sign in. Seeded demo users (if you ran `npm run db:seed` with your own password):
`DEMO-EMP-01` (employee), `DEMO-ADM-01` / `DEMO-ADM-02` (administrators), `DEMO-SK-01` (storekeeper).

## Demonstration journey

1. Sign in as `DEMO-EMP-01` → **New request** → add chemicals/pack sizes → purpose → submit. Note the request number.
2. Sign out; sign in as `DEMO-ADM-01` → **Review queue** → open the request → **Approve** (or **Reject** with a reason).
3. Sign in as `DEMO-SK-01` → **Issue desk** → open it → **Record issue** → confirm. Stock is deducted now, not at approval.
4. Sign in as `DEMO-EMP-01` → **My requests**: status shows _Issued_ with the history timeline.

## Scripts

`dev` · `build` · `preview` · `typecheck` · `lint` · `format:check` · `test`

## Notes

- No secrets live in the frontend. API base path is `/api/v1` (override with `VITE_API_BASE_URL`; dev proxy target with `VITE_DEV_API_TARGET`).
- If the page cannot reach the API, check the backend is running and `APP_ORIGIN` matches the address in your browser.
