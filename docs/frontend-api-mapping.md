# Frontend ↔ backend API mapping (core journey)

Source of truth: the backend Zod schemas in `server/src/modules/**` (mirrored by `client/src/types/api.ts`).
Base path `/api/v1`; session cookie + `X-CSRF-Token` on every non-GET request (handled in `client/src/lib/api-client.ts`).

| Screen (route) | Roles | Endpoint(s) | Response fields used |
|---|---|---|---|
| **Sign in** `/login` | public | `GET /auth/csrf` (token) · `POST /auth/login` `{identifier,password}` | `data.user`, `data.csrfToken`; errors `INVALID_CREDENTIALS`, `RATE_LIMITED` |
| **Session probe / guard** (every route) | any | `GET /auth/me` (401 ⇒ signed out) | `data.user{id,employeeCode,fullName,role,status}`, `data.csrfToken` |
| **Sign out** | any | `POST /auth/logout` | – |
| **Dashboard** `/` | any (+admin/storekeeper tiles) | `GET /requests/counts?requestedBy=<me>` (one grouped query shared by all stat cards) · `GET /requests?requestedBy=<me>&pageSize=5` | status counts, request summaries |
| **Chemicals** `/chemicals` | any | `GET /chemicals?q=&page=&pageSize=` | `data[]{id,chemicalCode,name,storageLocation,category,hazardNotes,isActive,packSizes[]{id,label,unitType,baseQuantity,isActive,balance{available,lowStock,onHand?,reserved?,minimumQuantity?}}}`, `meta` |
| **New request** `/requests/new` | any | `GET /chemicals?q=…` (picker) · `POST /requests` `{purpose,department?,items[{chemicalId,packSizeId,quantity}]}` · `PATCH /requests/:id` (only when the user edits after a failed attempt) · `POST /requests/:id/submit` | `data.id`, `data.requestNumber` (shown only after the server confirms) |
| **My requests** `/requests` | any | `GET /requests?requestedBy=<me>&status=&page=&pageSize=15` | `data[]{id,requestNumber,status,purpose,requester,itemCount,submittedAt}`, `meta` |
| **Request detail** `/requests/:id` | any (404 if not visible) | `GET /requests/:id` | `data{…summary, items[{id,chemical,packSize,availability,requestedQuantity,approvedQuantity,issuedQuantity,remainingToIssue}], approvalActions[], issues[]}` (timeline is derived from these) |
| Owner actions (detail) | owner | `POST /requests/:id/submit` (draft) · `POST /requests/:id/cancel` `{reason?}` | updated `data` |
| **Review queue** `/review` | ADMIN | `GET /requests?status=SUBMITTED` (also `APPROVED,PARTIALLY_ISSUED,ISSUED`, `REJECTED`) `&q=` | as list above |
| Approve / Reject (detail) | ADMIN | `POST /requests/:id/approve` `{comments?,approvedQuantities?[{requestItemId,approvedQuantity}]}` · `POST /requests/:id/reject` `{reason ≥10 chars}` | updated `data`; errors `ALREADY_DECIDED` (409), `SELF_APPROVAL_FORBIDDEN` (403) |
| **Issue desk** `/issue` | STOREKEEPER | `GET /requests?status=APPROVED,PARTIALLY_ISSUED` (and `ISSUED`) | as list above |
| Record issue (detail) | STOREKEEPER | `POST /requests/:id/issue` `{lines[{requestItemId,quantity}],note?}` + header `Idempotency-Key` (available stock is included in request detail) | updated `data`; errors `INSUFFICIENT_STOCK`, `OVER_ISSUE`, `INVALID_STATE_TRANSITION` (409/422) |

## Rules the UI follows
- Nothing changes on screen until the server confirms; request numbers, statuses and stock come from responses.
- Approval and issue are separate screens/actions; the UI never deducts or infers stock.
- Admin cannot issue by default (`ALLOW_ADMIN_ISSUE=false`), so the Issue desk is storekeeper-only. If you enable that flag, add `ADMIN` to the route and nav role lists.
- The backend returns **404** (not 403) for requests the caller may not see; the UI shows "not found or no access".
- Quantities are whole packs of a specific pack size; units are never converted.

## Not in this slice (later)
Stock receipts/adjustments/reversals, inventory thresholds, reports + CSV, audit log, user and chemical administration, PWA.
