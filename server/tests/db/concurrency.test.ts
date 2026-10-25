import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DECREMENT_STOCK_SQL,
  LOCK_REQUEST_SQL,
  NEXT_REQUEST_SEQUENCE_SQL,
  formatRequestNumber,
} from "../../src/modules/stock-transactions/sql.js";
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

/** Mirrors the stock-issue algorithm: conditional decrement + ledger row in ONE transaction. */
async function attemptIssue(
  f: { chemicalId: string; packSizeId: string; userId: string },
  itemId: string,
  qty: number,
  key: string,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const upd = await c.query(DECREMENT_STOCK_SQL, [f.chemicalId, f.packSizeId, qty]);
    if (upd.rowCount !== 1) {
      await c.query("ROLLBACK");
      return "INSUFFICIENT" as const;
    }
    await c.query(
      `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, request_item_id, performed_by, idempotency_key)
       VALUES ($1::uuid, $2::uuid, 'ISSUE', $3, $4::uuid, $5::uuid, $6)`,
      [f.chemicalId, f.packSizeId, qty, itemId, f.userId, key],
    );
    await c.query("COMMIT");
    return "OK" as const;
  } catch (e) {
    await c.query("ROLLBACK");
    return `ERR:${(e as { code?: string }).code}` as const;
  } finally {
    c.release();
  }
}

describe("concurrent stock deduction (SQL level, pg driver)", () => {
  it("20 parallel single-pack issues against 5 packs: exactly 5 succeed, stock ends at 0, never negative", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 5);
    const { itemId } = await insertRequest(pool, f, { status: "APPROVED", requested: 100, approved: 100 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => attemptIssue(f, itemId, 1, `k-${i}`)),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(5);
    expect(results.filter((r) => r === "INSUFFICIENT")).toHaveLength(15);
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [f.packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(0);
    const tx = await pool.query(
      "SELECT coalesce(sum(quantity),0)::int AS s, count(*)::int AS n FROM stock_transactions WHERE transaction_type = 'ISSUE'",
    );
    expect(tx.rows[0]).toEqual({ s: 5, n: 5 });
  });

  it("10 parallel issues of 3 packs against 10 packs: exactly 3 succeed, 1 pack left", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 10);
    const { itemId } = await insertRequest(pool, f, { status: "APPROVED", requested: 100, approved: 100 });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => attemptIssue(f, itemId, 3, `m-${i}`)),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(3);
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [f.packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(1);
  });

  it("the ledger always reconciles with the balance (opening 7 - issued)", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 7);
    const { itemId } = await insertRequest(pool, f, { status: "APPROVED", requested: 100, approved: 100 });
    await Promise.all(Array.from({ length: 12 }, (_, i) => attemptIssue(f, itemId, 2, `r-${i}`)));
    const q = await pool.query(
      `SELECT b.on_hand_quantity AS on_hand,
              (SELECT coalesce(sum(quantity),0)::int FROM stock_transactions t WHERE t.pack_size_id = b.pack_size_id AND t.transaction_type = 'ISSUE') AS issued
         FROM inventory_balances b WHERE b.pack_size_id = $1::uuid`,
      [f.packSizeId],
    );
    expect(q.rows[0].on_hand + q.rows[0].issued).toBe(7);
    expect(q.rows[0].on_hand).toBeGreaterThanOrEqual(0);
  });

  it("a failure after the deduction rolls the deduction back", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 5);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const upd = await c.query(DECREMENT_STOCK_SQL, [f.chemicalId, f.packSizeId, 2]);
      expect(upd.rowCount).toBe(1);
      // ISSUE without a request_item violates chk_tx_issue_link -> whole transaction must be undone
      await expect(
        c.query(
          `INSERT INTO stock_transactions (chemical_id, pack_size_id, transaction_type, quantity, performed_by)
           VALUES ($1::uuid, $2::uuid, 'ISSUE', 2, $3::uuid)`,
          [f.chemicalId, f.packSizeId, u],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [f.packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(5);
  });

  it("a duplicate idempotency key can never deduct twice, even when raced", async () => {
    const u = await insertUser(pool);
    const f = await insertChemicalWithStock(pool, u, 10);
    const { itemId } = await insertRequest(pool, f, { status: "APPROVED", requested: 10, approved: 10 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => attemptIssue(f, itemId, 1, "same-key")),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "ERR:23505")).toHaveLength(7);
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [f.packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(9);
  });
});

describe("concurrent decisions and numbering", () => {
  it("10 reviewers racing on one request: exactly one decision is applied", async () => {
    const u = await insertUser(pool, "EMPLOYEE");
    const reviewer = await insertUser(pool, "ADMIN");
    const f = await insertChemicalWithStock(pool, u, 5);
    const { requestId } = await insertRequest(pool, f, { status: "SUBMITTED" });

    const decide = async (): Promise<"APPLIED" | "ALREADY_DECIDED"> => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const locked = await c.query(LOCK_REQUEST_SQL, [requestId]);
        if (locked.rows[0].status !== "SUBMITTED") {
          await c.query("ROLLBACK");
          return "ALREADY_DECIDED";
        }
        await c.query(
          "INSERT INTO approval_actions (request_id, reviewed_by, decision) VALUES ($1::uuid, $2::uuid, 'APPROVED')",
          [requestId, reviewer],
        );
        await c.query(
          "UPDATE chemical_requests SET status = 'APPROVED', decided_by = $2::uuid, decided_at = now(), updated_at = now() WHERE id = $1::uuid",
          [requestId, reviewer],
        );
        await c.query("COMMIT");
        return "APPLIED";
      } finally {
        c.release();
      }
    };

    const results = await Promise.all(Array.from({ length: 10 }, decide));
    expect(results.filter((r) => r === "APPLIED")).toHaveLength(1);
    expect(results.filter((r) => r === "ALREADY_DECIDED")).toHaveLength(9);
    const n = await pool.query(
      "SELECT count(*)::int AS n FROM approval_actions WHERE request_id = $1::uuid",
      [requestId],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it("50 parallel request-number draws are all unique", async () => {
    const draws = await Promise.all(Array.from({ length: 50 }, () => pool.query(NEXT_REQUEST_SEQUENCE_SQL)));
    const numbers = draws.map((d) => formatRequestNumber(d.rows[0].n, new Date("2026-10-23T00:00:00Z")));
    expect(new Set(numbers).size).toBe(50);
    expect(numbers[0]).toMatch(/^REQ-2026-\d{6}$/);
  });
});
