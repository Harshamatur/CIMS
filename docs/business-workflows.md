# Business workflows

## Roles
| Role | Can |
|---|---|
| EMPLOYEE | Browse active chemicals (available stock only); create, edit, submit, cancel **own** requests |
| ADMIN | Everything an employee can; review (approve/reject) requests; manage users and master data; adjust and reverse stock; receipts; reports; audit |
| STOREKEEPER | Everything an employee can; see approved/issued requests; record **issues**; record receipts; see stock and reports |

## Request lifecycle
```
DRAFT -> SUBMITTED -> APPROVED -> PARTIALLY_ISSUED -> ISSUED
                  \-> REJECTED            (APPROVED -> ISSUED when issued in one go)
DRAFT | SUBMITTED | APPROVED(nothing issued) -> CANCELLED
```
REJECTED, ISSUED and CANCELLED are terminal. Any other transition is rejected by `common/state-machine.ts`.

## Submit
Employee creates a draft (multiple items) → every item is validated against current master data → submit assigns
`REQ-YYYY-NNNNNN` and the request appears in the admin queue (`GET /requests?status=SUBMITTED`). The queue is the only
"delivery" mechanism — no e-mail or SMS is sent or simulated. A second submit returns 409.

## Decision
Row-locks the request, requires status SUBMITTED, forbids the requester from deciding, writes `approval_actions`,
updates the request and audits — in one transaction. Racing reviewers: one wins, the rest get `409 ALREADY_DECIDED`.
Rejection needs a reason ≥ 10 characters. Partial approval is allowed per item; approved never exceeds requested.
**Approval does not touch stock.**

## Issue (physical hand-over)
`POST /requests/:id/issue` with `Idempotency-Key`. In one transaction: lock request → replay check → status must be
APPROVED/PARTIALLY_ISSUED → per line: remaining-approved check, conditional stock decrement (0 rows ⇒ 409
`INSUFFICIENT_STOCK`), ISSUE ledger row, `issued_quantity` update → derive request status → audit. Any failure
rolls back everything. Same key + same payload ⇒ original result, no second deduction.

## Receipts, adjustments, reversals
Receipt (ADMIN/STOREKEEPER, reference required). Adjustment (ADMIN, reason ≥ 10). Reversal (ADMIN, reason ≥ 10) appends
a REVERSAL row; history is never edited. Reversals of ISSUE rows are not supported.

## Reconciliation
For any pack size: `on_hand = Σ(RECEIPT + ADJUSTMENT_IN + reversed-OUT) − Σ(ISSUE + ADJUSTMENT_OUT + reversed-IN)`.
`tests/db/concurrency.test.ts` asserts `on_hand + Σ issued = opening stock` after contention.
