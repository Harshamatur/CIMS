import pg from "pg";
import { assertSafeTestDatabase } from "../../src/common/db-safety.js";

export function createTestPool(): pg.Pool {
  const url = process.env.TEST_DATABASE_URL;
  assertSafeTestDatabase(url);
  return new pg.Pool({ connectionString: url, max: 30 });
}

export async function assertMigrated(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query("select to_regclass('public.stock_transactions') as t");
  if (!rows[0]?.t) {
    throw new Error("Test database has no CIMS schema. Apply migrations first (see docs/testing.md).");
  }
}

/** Wipes data in the TEST database only. Append-only triggers are disabled just for the duration of the wipe. */
export async function resetData(pool: pg.Pool): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("ALTER TABLE stock_transactions DISABLE TRIGGER USER");
    await c.query("ALTER TABLE audit_logs DISABLE TRIGGER USER");
    await c.query(
      `TRUNCATE approval_actions, stock_transactions, audit_logs, request_items, chemical_requests,
                inventory_balances, pack_sizes, chemicals, users, session RESTART IDENTITY CASCADE`,
    );
    await c.query("ALTER TABLE stock_transactions ENABLE TRIGGER USER");
    await c.query("ALTER TABLE audit_logs ENABLE TRIGGER USER");
    await c.query("ALTER SEQUENCE request_number_seq RESTART WITH 1");
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

export interface Fixture {
  userId: string;
  chemicalId: string;
  packSizeId: string;
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function insertUser(pool: pg.Pool, role = "EMPLOYEE"): Promise<string> {
  const n = uniq();
  const { rows } = await pool.query(
    `INSERT INTO users (employee_code, full_name, password_hash, role, updated_at)
     VALUES ($1, $2, 'not-a-real-hash', $3::role, now()) RETURNING id::text`,
    [`T-${n}`, `Test User ${n}`, role],
  );
  return rows[0].id as string;
}

export async function insertChemicalWithStock(
  pool: pg.Pool,
  userId: string,
  onHand: number,
  unit: { type: string; base: string; label: string; qty: string } = {
    type: "VOLUME",
    base: "ml",
    label: "500 ml",
    qty: "500",
  },
): Promise<Fixture> {
  const n = uniq();
  const chem = await pool.query(
    `INSERT INTO chemicals (chemical_code, name, created_by, updated_at) VALUES ($1, $2, $3::uuid, now()) RETURNING id::text`,
    [`DEMO-${n}`, `Demo Chemical ${n}`, userId],
  );
  const chemicalId = chem.rows[0].id as string;
  const pack = await pool.query(
    `INSERT INTO pack_sizes (chemical_id, label, unit_type, base_unit, base_quantity, updated_at)
     VALUES ($1::uuid, $2, $3::unit_type, $4::base_unit, $5, now()) RETURNING id::text`,
    [chemicalId, unit.label, unit.type, unit.base, unit.qty],
  );
  const packSizeId = pack.rows[0].id as string;
  await pool.query(
    `INSERT INTO inventory_balances (chemical_id, pack_size_id, on_hand_quantity, updated_at) VALUES ($1::uuid, $2::uuid, $3, now())`,
    [chemicalId, packSizeId, onHand],
  );
  return { userId, chemicalId, packSizeId };
}

export async function insertRequest(
  pool: pg.Pool,
  f: Fixture,
  opts: { status?: string; requested?: number; approved?: number | null; issued?: number } = {},
): Promise<{ requestId: string; itemId: string }> {
  const status = opts.status ?? "SUBMITTED";
  const n = uniq();
  const hasDecision = ["APPROVED", "PARTIALLY_ISSUED", "ISSUED"].includes(status);
  const r = await pool.query(
    `INSERT INTO chemical_requests (request_number, requested_by, purpose, status, submitted_at, decided_by, decided_at, updated_at)
     VALUES ($1, $2::uuid, 'Test purpose', $3::request_status, now(), $4, $5, now()) RETURNING id::text`,
    [`REQ-T-${n}`, f.userId, status, hasDecision ? f.userId : null, hasDecision ? new Date() : null],
  );
  const requestId = r.rows[0].id as string;
  const i = await pool.query(
    `INSERT INTO request_items (request_id, chemical_id, pack_size_id, requested_quantity, approved_quantity, issued_quantity, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, now()) RETURNING id::text`,
    [
      requestId,
      f.chemicalId,
      f.packSizeId,
      opts.requested ?? 5,
      opts.approved === undefined ? null : opts.approved,
      opts.issued ?? 0,
    ],
  );
  return { requestId, itemId: i.rows[0].id as string };
}
