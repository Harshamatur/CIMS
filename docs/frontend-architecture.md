# Frontend architecture (core journey)

Stack: React 19, TypeScript (strict), Vite 8, React Router 7, Tailwind CSS 4, TanStack Query 5, React Hook Form + Zod,
Radix Dialog, lucide-react, Vitest + Testing Library. **shadcn/ui CLI is not used** (it fetches from a registry);
the components in `src/components/ui` are hand-written in the same style (Radix primitives + cva + tailwind-merge).

## Structure
```
client/src
  app/         router.tsx, providers.tsx, guards.tsx (RequireAuth, RequireRole)
  components/  ui/ (button, field, badge, card, alert, dialog, skeleton), layout/ (shell, nav), feedback/ (states, toast), data-display/
  features/    auth, dashboard, chemicals, requests, approvals, stock-issues
  lib/         api-client.ts (single typed client), errors.ts, idempotency.ts, query-client.ts, utils.ts
  types/api.ts mirrors backend response/request shapes
  tests/       helpers.tsx (fetch mock + render helpers), logic.test.ts, screens.test.tsx
```

## Key decisions
- **One API client.** Cookies via `credentials: "include"`; CSRF token held in memory only and fetched on demand; one
  safe refresh-and-retry on `CSRF_FAILED`; a 401 anywhere clears cached data and returns the user to sign-in with a
  "Session ended" notice. No localStorage/sessionStorage for tokens or data.
- **Server state only in TanStack Query.** After every mutation lists, counts, the request and chemical stock are invalidated.
- **Idempotent issue.** `IssueKeyStore` keeps one `Idempotency-Key` per distinct payload, so retrying after a dropped
  connection cannot deduct twice; changing quantities creates a new key.
- **No duplicate drafts.** The new-request flow creates the draft once; a failed submit is retried without creating another.
- **Timeline derived from real records** (request timestamps, approval actions, issue transactions). Cancellation has no
  event record, so it uses `updatedAt` and is labelled "approximate".
- **Role-aware navigation is convenience only.** The backend enforces every permission and returns 403/404 regardless.
- **Dev proxy.** `/api` is proxied to `http://localhost:3000`, so the browser sees one origin (`http://localhost:5173`,
  which must equal the backend `APP_ORIGIN`).

## Design system
Tokens in `src/styles/index.css` (`@theme`): navy 950–700 navigation, brand blue 600/700 actions, green/amber/red status
tones, neutral canvas/line/ink. Status always uses text + icon, never colour alone. 44 px minimum touch targets,
visible focus rings, skip link, `prefers-reduced-motion` support, labelled form controls with announced errors.
Responsive: sidebar ≥ `lg`, drawer navigation below; list screens switch from table to cards below `md`.

## Known limitations / next
- Single JS chunk (~610 kB, ~190 kB gzip): add route-level code splitting later.
- No PWA, charts, reports, audit, stock receipts/adjustments, or user/chemical administration yet.
- Playwright end-to-end tests are pending a running backend; unit/screen tests use a mocked `fetch` only.
- Types are hand-mirrored; generate them from `docs/openapi.json` (`npm run openapi:export` in `server/`) once available.
