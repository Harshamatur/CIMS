# Database design

PostgreSQL (Neon). UUID keys (`gen_random_uuid()`), `TIMESTAMPTZ(6)` (UTC), integer quantities, enums for statuses.
Schema: `server/prisma/schema.prisma`. SQL: `server/prisma/migrations/0001_init` (structure) and `0002_integrity`
(sequence, CHECKs, triggers).

## Tables
`users` · `chemicals` · `pack_sizes` · `inventory_balances` · `chemical_requests` · `request_items` ·
`approval_actions` · `stock_transactions` · `audit_logs` · `session` (connect-pg-simple).

## Stock model
- `inventory_balances` has one row per pack size (`UNIQUE(pack_size_id)`, `UNIQUE(chemical_id, pack_size_id)`).
- `on_hand_quantity`: physical packs. `reserved_quantity`: always 0 in this prototype.
  `available_quantity = on_hand - reserved` (derived; `CHECK reserved <= on_hand` so it can never be negative).
- `version` increments on every change (for diagnostics / future optimistic locking).

### Ledger sign convention
`stock_transactions.quantity` is **always positive**; direction comes from `transaction_type`:

| Type | Effect on on-hand |
|---|---|
| RECEIPT, ADJUSTMENT_IN | + quantity |
| ISSUE, ADJUSTMENT_OUT | − quantity |
| REVERSAL | opposite of the transaction named in `reversal_of_id` |

The API adds an explicit `direction: IN | OUT` to every transaction so consumers never guess. Rows are append-only
(trigger-enforced); corrections are new REVERSAL rows. Each transaction can be reversed once (`UNIQUE(reversal_of_id)`).

## Constraints (second layer behind service validation)
- Non-negative stock, reserved ≤ on-hand, non-negative thresholds.
- `request_items`: requested > 0; 0 ≤ approved ≤ requested; issued ≤ approved; one line per pack size per request.
- Pack sizes: positive size; unit type must match base unit (`MASS→g`, `VOLUME→ml`, `COUNT→piece`); unique label and
  unique (unit, size) per chemical. Mass and volume are never converted or mixed.
- Composite foreign keys `(pack_size_id, chemical_id) → pack_sizes(id, chemical_id)` on balances, request items and
  stock transactions: a pack size can only be used with its own chemical.
- Requests: non-draft needs request number + submitted time; REJECTED needs a ≥10-character reason; approved/issued
  states need decider + time.
- Stock transactions: positive quantity; `ISSUE ⇔ request_item_id`; `REVERSAL ⇔ reversal_of_id`; reasons required except for issues.
- `idempotency_key` UNIQUE. Request numbers come from `request_number_seq` (`REQ-YYYY-000001`, gaps possible).
- Append-only triggers on `stock_transactions` and `audit_logs` block UPDATE, DELETE and TRUNCATE.
  **Limitation:** a database owner/superuser can disable triggers; see `security.md`.

## Low stock
A balance is low when `minimum_quantity > 0 AND available <= minimum_quantity`. `chemicals.minimum_stock_alert`
is the default copied into new balances; thresholds are per pack size and are never summed across units.

## Migration workflow
1. `npx prisma generate && npx prisma validate`
2. Change `schema.prisma`; `npx prisma migrate dev --create-only --name <change>` against a dev branch; review the SQL;
   put non-Prisma objects (CHECKs, triggers) in a hand-written migration.
3. Deploy with `npm run migrate:deploy` (never on app start-up). Take a Neon restore point/branch first.
