/**
 * Parameterised SQL used for stock mutation. Single source of truth: executed by the services through
 * Prisma (`$executeRawUnsafe` with bound parameters — values are never concatenated) and by the
 * SQL-level concurrency tests through the `pg` driver.
 */

/** Atomically remove stock only if enough is AVAILABLE (on_hand - reserved). 0 rows updated => insufficient stock. */
export const DECREMENT_STOCK_SQL = `
UPDATE inventory_balances
   SET on_hand_quantity = on_hand_quantity - $3::int,
       version = version + 1,
       updated_at = now()
 WHERE chemical_id = $1::uuid
   AND pack_size_id = $2::uuid
   AND on_hand_quantity - reserved_quantity >= $3::int`;

/** Add stock. 0 rows updated => balance row does not exist. */
export const INCREMENT_STOCK_SQL = `
UPDATE inventory_balances
   SET on_hand_quantity = on_hand_quantity + $3::int,
       version = version + 1,
       updated_at = now()
 WHERE chemical_id = $1::uuid
   AND pack_size_id = $2::uuid`;

/** Row-level lock on a request so that decisions / issues for the same request are serialised. */
export const LOCK_REQUEST_SQL = `
SELECT id::text AS id, status::text AS status, requested_by::text AS requested_by
  FROM chemical_requests
 WHERE id = $1::uuid
   FOR UPDATE`;

/** Gap-tolerant, concurrency-safe request numbering. */
export const NEXT_REQUEST_SEQUENCE_SQL = `SELECT nextval('request_number_seq')::text AS n`;

export function formatRequestNumber(sequence: string | number | bigint, now: Date = new Date()): string {
  return `REQ-${now.getUTCFullYear()}-${String(sequence).padStart(6, "0")}`;
}
