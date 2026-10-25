# API reference (overview)

Base path `/api/v1`. The generated, always-current contract is the OpenAPI 3.1 document at `/api/v1/openapi.json`
(Swagger UI at `/docs`; export with `npm run openapi:export` → `docs/openapi.json`). *Not yet generated — requires the Prisma Client.*

## Conventions
- JSON; success envelope `{ "data": ... }`, lists `{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.
- Errors: `{ "error": { "code", "message", "fieldErrors?": [{path,message}], "requestId" } }` with the same id in `X-Request-Id`.
- Auth: HttpOnly session cookie. **Every state-changing request** (including login) needs `X-CSRF-Token`
  (from `GET /auth/csrf`, `POST /auth/login` or `GET /auth/me`). Browser frontends send `credentials: "include"`.
- Pagination `?page=1&pageSize=25` (max 100). Unknown body fields are rejected (400).
- `Idempotency-Key` header: required on `POST /requests/:id/issue`, optional on receipts/adjustments.

## Status codes
400 validation · 401 unauthenticated / bad credentials · 403 forbidden / CSRF / self-approval · 404 not found **or not yours** ·
409 conflict (`INVALID_STATE_TRANSITION`, `ALREADY_DECIDED`, `INSUFFICIENT_STOCK`, `IDEMPOTENCY_CONFLICT`, `DUPLICATE_RESOURCE`) ·
422 business rule (`OVER_ISSUE`, invalid items) · 429 rate limited.

## Endpoints
| Method & path | Roles |
|---|---|
| GET `/auth/csrf` · POST `/auth/login` · POST `/auth/logout` · GET `/auth/me` | public · public · any · any |
| GET/POST `/users` · GET/PATCH `/users/:id` · POST `/users/:id/reset-password` | ADMIN |
| GET `/chemicals`, `/chemicals/:id` | any (employees: active only, availability only) |
| POST `/chemicals` · PATCH `/chemicals/:id` · POST `/chemicals/:id/pack-sizes` · PATCH `/chemicals/:id/pack-sizes/:packSizeId` | ADMIN |
| GET `/inventory` | ADMIN, STOREKEEPER |
| PATCH `/inventory/:packSizeId/threshold` | ADMIN |
| GET/POST `/requests` · GET/PATCH `/requests/:id` · POST `/requests/:id/submit` · POST `/requests/:id/cancel` | any (visibility rules apply) |
| POST `/requests/:id/approve` · POST `/requests/:id/reject` | ADMIN |
| POST `/requests/:id/issue` | STOREKEEPER (+ADMIN if `ALLOW_ADMIN_ISSUE=true`) |
| GET `/stock-transactions` | ADMIN, STOREKEEPER |
| POST `/stock-transactions/receipts` | ADMIN, STOREKEEPER |
| POST `/stock-transactions/adjustments` · POST `/stock-transactions/:id/reverse` | ADMIN |
| GET `/reports/inventory` · `/reports/low-stock` (`?format=csv`) | ADMIN, STOREKEEPER |
| GET `/reports/requests` (`?format=csv`) | ADMIN |
| GET `/reports/stock-transactions` (`?format=csv`) | ADMIN, STOREKEEPER |
| GET `/audit-logs` | ADMIN |
| GET `/health`, `/ready` (root, not under `/api/v1`) | public |

## Examples
```http
POST /api/v1/auth/login
X-CSRF-Token: <from GET /auth/csrf>
{ "identifier": "DEMO-EMP-01", "password": "<your seed password>" }
→ 200 { "data": { "user": { "id": "…", "role": "EMPLOYEE", … }, "csrfToken": "…" } }
```
```http
POST /api/v1/requests
{ "purpose": "Weekly boiler water test", "items": [ { "chemicalId": "…", "packSizeId": "…", "quantity": 4 } ] }
→ 201 { "data": { "status": "DRAFT", "requestNumber": null, "items": [ … ] } }
POST /api/v1/requests/{id}/submit → 200 { "data": { "status": "SUBMITTED", "requestNumber": "REQ-2026-000001", … } }
```
```http
POST /api/v1/requests/{id}/issue
Idempotency-Key: 9b2f6c1e-3a0d-4f7e-8d52-6d1f0a7c9e11
{ "lines": [ { "requestItemId": "…", "quantity": 3 } ] }
→ 200 { "data": { "status": "PARTIALLY_ISSUED", "items": [ { "approvedQuantity": 4, "issuedQuantity": 3, "remainingToIssue": 1 } ] } }
→ 409 { "error": { "code": "INSUFFICIENT_STOCK", "message": "…", "requestId": "…" } }
```
