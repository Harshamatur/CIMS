import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertMigrated,
  createTestPool,
  insertChemicalWithStock,
  insertRequest,
  insertUser,
  resetData,
} from "../helpers/pg.js";

let pool: pg.Pool;
beforeAll(async () => {
  pool = createTestPool();
  await assertMigrated(pool);
});
afterAll(async () => pool.end());
beforeEach(async () => resetData(pool));

/** Runs a statement expected to fail and returns the PostgreSQL error code (SQLSTATE). */
async function sqlState(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await pool.query(sql, params);
  } catch (e) {
    return (e as { code: string }).code;
  }
  throw new Error("expected statement to fail but it succeeded");
}
const CHECK = "23514";
const UNIQUE = "23505";
const FK = "23503";
const INTEGRITY = "23000";

describe("inventory balance constraints", () => {
  it("rejects negative on-hand stock", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 3);
    expect(
      await sqlState("UPDATE inventory_balances SET on_hand_quantity = -1 WHERE pack_size_id = $1::uuid", [
        f.packSizeId,
      ]),
    ).toBe(CHECK);
  });
  it("rejects reserved quantity above on-hand (available can never be negative)", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 3);
    expect(
      await sqlState("UPDATE inventory_balances SET reserved_quantity = 4 WHERE pack_size_id = $1::uuid", [
        f.packSizeId,
      ]),
    ).toBe(CHECK);
  });
  it("rejects a balance whose pack size belongs to a different chemical (composite FK)", async () => {
    const u = await insertUser(pool);
    const a = await insertChemicalWithStock(pool, u, 1);
    const b = await insertChemicalWithStock(pool, u, 1);
    // a pack size of chemical B that has no balance row yet, so only the composite FK can reject the insert
    const orphan = await pool.query(
      "INSERT INTO pack_sizes (chemical_id, label, unit_type, base_unit, base_quantity, updated_at) VALUES ($1::uuid, '1000 ml', 'VOLUME', 'ml', 1000, now()) RETURNING id::text",
      [b.chemicalId],
    );
    expect(
      await sqlState(
        "INSERT INTO inventory_balances (chemical_id, pack_size_id, updated_at) VALUES ($1::uuid, $2::uuid, now())",
        [a.chemicalId, orphan.rows[0].id],
      ),
    ).toBe(FK);
  });
  it("allows only one balance row per pack size", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 1);
    expect(
      await sqlState(
        "INSERT INTO inventory_balances (chemical_id, pack_size_id, updated_at) VALUES ($1::uuid, $2::uuid, now())",
        [f.chemicalId, f.packSizeId],
      ),
    ).toBe(UNIQUE);
  });
});

describe("pack size constraints (mass and volume are never mixed)", () => {
  it("rejects MASS measured in ml and VOLUME measured in g", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 0);
    const ins =
      "INSERT INTO pack_sizes (chemical_id, label, unit_type, base_unit, base_quantity, updated_at) VALUES ($1::uuid, $2, $3::unit_type, $4::base_unit, $5, now())";
    expect(await sqlState(ins, [f.chemicalId, "bad1", "MASS", "ml", "100"])).toBe(CHECK);
    expect(await sqlState(ins, [f.chemicalId, "bad2", "VOLUME", "g", "100"])).toBe(CHECK);
    expect(await sqlState(ins, [f.chemicalId, "bad3", "VOLUME", "ml", "0"])).toBe(CHECK);
  });
  it("rejects duplicate packaging configuration for one chemical", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 0);
    const ins =
      "INSERT INTO pack_sizes (chemical_id, label, unit_type, base_unit, base_quantity, updated_at) VALUES ($1::uuid, $2, 'VOLUME', 'ml', $3, now())";
    expect(await sqlState(ins, [f.chemicalId, "another label", "500"])).toBe(UNIQUE);
    expect(await sqlState(ins, [f.chemicalId, "500 ml", "250"])).toBe(UNIQUE);
  });
});

describe("request and item constraints", () => {
  it("rejects zero requested quantity, over-approval and over-issue", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 10);
    const { itemId } = await insertRequest(pool, f, {
      status: "APPROVED",
      requested: 5,
      approved: 4,
      issued: 0,
    });
    expect(
      await sqlState("UPDATE request_items SET requested_quantity = 0 WHERE id = $1::uuid", [itemId]),
    ).toBe(CHECK);
    expect(
      await sqlState("UPDATE request_items SET approved_quantity = 6 WHERE id = $1::uuid", [itemId]),
    ).toBe(CHECK);
    expect(await sqlState("UPDATE request_items SET issued_quantity = 5 WHERE id = $1::uuid", [itemId])).toBe(
      CHECK,
    );
  });
  it("rejects a duplicate pack size within the same request", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 10);
    const { requestId } = await insertRequest(pool, f);
    expect(
      await sqlState(
        "INSERT INTO request_items (request_id, chemical_id, pack_size_id, requested_quantity, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, now())",
        [requestId, f.chemicalId, f.packSizeId],
      ),
    ).toBe(UNIQUE);
  });
  it("requires a request number once submitted and a real reason when rejected", async () => {
    const u = await insertUser(pool);
    expect(
      await sqlState(
        "INSERT INTO chemical_requests (requested_by, purpose, status, updated_at) VALUES ($1::uuid, 'p', 'SUBMITTED', now())",
        [u],
      ),
    ).toBe(CHECK);
    expect(
      await sqlState(
        `INSERT INTO chemical_requests (request_number, requested_by, purpose, status, submitted_at, decided_by, decided_at, rejection_reason, updated_at)
         VALUES ('REQ-X', $1::uuid, 'p', 'REJECTED', now(), $1::uuid, now(), 'no', now())`,
        [u],
      ),
    ).toBe(CHECK);
  });
  it("allows exactly one approval decision per request", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 1);
    const { requestId } = await insertRequest(pool, f);
    const ins =
      "INSERT INTO approval_actions (request_id, reviewed_by, decision) VALUES ($1::uuid, $2::uuid, 'APPROVED')";
    await pool.query(ins, [requestId, u]);
    expect(await sqlState(ins, [requestId, u])).toBe(UNIQUE);
  });
});

describe("stock transaction constraints", () => {
  it("requires positive quantity, a link for ISSUE, a link for REVERSAL and a reason for receipts", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 1);
    const base =
      "INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by, reason) VALUES ($1::uuid, $2::uuid, $3::transaction_type, $4, $5::uuid, $6)";
    expect(await sqlState(base, [f.chemicalId, f.packSizeId, "RECEIPT", 0, u, "GRN 123"])).toBe(CHECK);
    expect(await sqlState(base, [f.chemicalId, f.packSizeId, "ISSUE", 1, u, null])).toBe(CHECK);
    expect(await sqlState(base, [f.chemicalId, f.packSizeId, "REVERSAL", 1, u, "fix typo"])).toBe(CHECK);
    expect(await sqlState(base, [f.chemicalId, f.packSizeId, "RECEIPT", 1, u, null])).toBe(CHECK);
    await pool.query(base, [f.chemicalId, f.packSizeId, "RECEIPT", 1, u, "GRN 123"]);
  });
  it("allows a transaction to be reversed only once and rejects duplicate idempotency keys", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 1);
    const r = await pool.query(
      `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by, reason, idempotency_key)
       VALUES ($1::uuid, $2::uuid, 'RECEIPT', 5, $3::uuid, 'GRN 1', 'key-1') RETURNING id::text`,
      [f.chemicalId, f.packSizeId, u],
    );
    const original = r.rows[0].id as string;
    const rev = `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by, reason, reversal_of_id)
                 VALUES ($1::uuid, $2::uuid, 'REVERSAL', 5, $3::uuid, 'entered twice', $4::uuid)`;
    await pool.query(rev, [f.chemicalId, f.packSizeId, u, original]);
    expect(await sqlState(rev, [f.chemicalId, f.packSizeId, u, original])).toBe(UNIQUE);
    expect(
      await sqlState(
        `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by, reason, idempotency_key)
         VALUES ($1::uuid, $2::uuid, 'RECEIPT', 1, $3::uuid, 'GRN 2', 'key-1')`,
        [f.chemicalId, f.packSizeId, u],
      ),
    ).toBe(UNIQUE);
  });
});

describe("append-only tables", () => {
  it("blocks UPDATE, DELETE and TRUNCATE on stock_transactions and audit_logs", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 1);
    await pool.query(
      `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by, reason)
       VALUES ($1::uuid, $2::uuid, 'RECEIPT', 1, $3::uuid, 'GRN 9')`,
      [f.chemicalId, f.packSizeId, u],
    );
    await pool.query(
      "INSERT INTO audit_logs (actor_user_id, action, entity_type) VALUES ($1::uuid, 'TEST', 'test')",
      [u],
    );
    expect(await sqlState("UPDATE stock_transactions SET quantity = 99")).toBe(INTEGRITY);
    expect(await sqlState("DELETE FROM stock_transactions")).toBe(INTEGRITY);
    expect(await sqlState("TRUNCATE stock_transactions CASCADE")).toBe(INTEGRITY);
    expect(await sqlState("UPDATE audit_logs SET action = 'TAMPERED'")).toBe(INTEGRITY);
    expect(await sqlState("DELETE FROM audit_logs")).toBe(INTEGRITY);
    expect(await sqlState("TRUNCATE audit_logs")).toBe(INTEGRITY);
  });
});
