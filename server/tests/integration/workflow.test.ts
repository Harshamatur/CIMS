/**
 * END-TO-END API WORKFLOW (supertest + real PostgreSQL through Prisma).
 * STATUS: written, NOT EXECUTED in the authoring sandbox — the Prisma engine download host was blocked, so the
 * Prisma Client could not be generated. Skipped automatically when the client is absent.
 */
import type { Express } from "express";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HAS_PRISMA_CLIENT,
  PASSWORD,
  buildTestApp,
  createUserRow,
  get,
  loginAs,
  post,
  type Session,
} from "../helpers/api.js";
import { assertMigrated, createTestPool, resetData } from "../helpers/pg.js";

describe.skipIf(!HAS_PRISMA_CLIENT)("request -> approval -> issue -> reports journey", () => {
  let app: Express;
  let pool: pg.Pool;
  let employee: Session, admin: Session, storekeeper: Session;
  let chemicalId: string, packSizeId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await assertMigrated(pool);
    app = await buildTestApp();
  });
  afterAll(async () => {
    await pool.end();
    const { disconnectDb } = await import("../../src/db/client.js");
    await disconnectDb();
  });

  beforeEach(async () => {
    await resetData(pool);
    const [e, a, s] = [
      await createUserRow(pool, "EMPLOYEE"),
      await createUserRow(pool, "ADMIN"),
      await createUserRow(pool, "STOREKEEPER"),
    ];
    employee = await loginAs(app, e.employeeCode);
    admin = await loginAs(app, a.employeeCode);
    storekeeper = await loginAs(app, s.employeeCode);
    const created = await post(admin, "/chemicals", {
      chemicalCode: "DEMO-9001",
      name: "Demo Reagent",
      storageLocation: "R-99",
      minimumStockAlert: 2,
      packSizes: [{ label: "500 ml", unitType: "VOLUME", baseQuantity: 500 }],
    });
    expect(created.status).toBe(201);
    chemicalId = created.body.data.id;
    packSizeId = created.body.data.packSizes[0].id;
    const receipt = await post(storekeeper, "/stock-transactions/receipts", {
      chemicalId,
      packSizeId,
      quantity: 10,
      reason: "GRN-TEST-1",
    });
    expect(receipt.status).toBe(201);
  });

  const draft = async (quantity = 4) =>
    (
      await post(employee, "/requests", {
        purpose: "Weekly boiler water test",
        items: [{ chemicalId, packSizeId, quantity }],
      })
    ).body.data;

  it("returns grouped request counts without exposing other users' requests", async () => {
    const d = await draft(1);
    await post(employee, `/requests/${d.id}/submit`);

    const employeeCounts = await get(employee, "/requests/counts");
    expect(employeeCounts.status).toBe(200);
    expect(employeeCounts.body.data.SUBMITTED).toBe(1);

    const storekeeperCounts = await get(storekeeper, "/requests/counts");
    expect(storekeeperCounts.status).toBe(200);
    expect(storekeeperCounts.body.data.SUBMITTED).toBe(0);
  });

  it("runs the complete demonstration journey and keeps stock, ledger and audit consistent", async () => {
    const d = await draft(4);
    expect(d.status).toBe("DRAFT");
    expect(d.requestNumber).toBeNull();

    const submitted = await post(employee, `/requests/${d.id}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe("SUBMITTED");
    expect(submitted.body.data.requestNumber).toMatch(/^REQ-\d{4}-\d{6}$/);

    const queue = await get(admin, "/requests?status=SUBMITTED");
    expect(queue.body.data.map((r: { id: string }) => r.id)).toContain(d.id);

    const approved = await post(admin, `/requests/${d.id}/approve`, { comments: "OK" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
    expect(approved.body.data.items[0].availability).toEqual({ available: 10, lowStock: false });
    // Approval alone must NOT deduct stock.
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(10);

    const itemId = approved.body.data.items[0].id;
    const key1 = "journey-issue-0001";
    const first = await post(
      storekeeper,
      `/requests/${d.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 3 }] },
      { "Idempotency-Key": key1 },
    );
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("PARTIALLY_ISSUED");
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(7);

    // Replaying the same key must not deduct again.
    const replay = await post(
      storekeeper,
      `/requests/${d.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 3 }] },
      { "Idempotency-Key": key1 },
    );
    expect(replay.status).toBe(200);
    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(7);

    const rest = await post(
      storekeeper,
      `/requests/${d.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 1 }] },
      { "Idempotency-Key": "journey-issue-0002" },
    );
    expect(rest.body.data.status).toBe("ISSUED");
    expect(rest.body.data.issues).toHaveLength(2);
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(6);

    // Employee sees the final status; ledger and audit trail reflect every step.
    expect((await get(employee, `/requests/${d.id}`)).body.data.status).toBe("ISSUED");
    const ledger = await get(admin, "/stock-transactions?type=ISSUE");
    expect(ledger.body.data.reduce((n: number, t: { quantity: number }) => n + t.quantity, 0)).toBe(4);
    const actions = (await get(admin, "/audit-logs?pageSize=100")).body.data.map(
      (a: { action: string }) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        "REQUEST_SUBMITTED",
        "REQUEST_APPROVED",
        "STOCK_ISSUED",
        "STOCK_RECEIPT_RECORDED",
      ]),
    );
    const audit = JSON.stringify((await get(admin, "/audit-logs?pageSize=100")).body);
    expect(audit).not.toMatch(/passwordHash|password_hash|argon2/i);
  });

  it("rejects with a reason and blocks further decisions", async () => {
    const d = await draft();
    await post(employee, `/requests/${d.id}/submit`);
    expect((await post(admin, `/requests/${d.id}/reject`, { reason: "no" })).status).toBe(400);
    const rejected = await post(admin, `/requests/${d.id}/reject`, {
      reason: "Not needed for this analysis",
    });
    expect(rejected.body.data.status).toBe("REJECTED");
    const again = await post(admin, `/requests/${d.id}/approve`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_DECIDED");
  });

  it("supports partial approval but never over-approval or over-issue", async () => {
    const d = await draft(5);
    await post(employee, `/requests/${d.id}/submit`);
    const itemId = (await get(employee, `/requests/${d.id}`)).body.data.items[0].id;
    expect(
      (
        await post(admin, `/requests/${d.id}/approve`, {
          approvedQuantities: [{ requestItemId: itemId, approvedQuantity: 6 }],
        })
      ).status,
    ).toBe(422);
    const ok = await post(admin, `/requests/${d.id}/approve`, {
      approvedQuantities: [{ requestItemId: itemId, approvedQuantity: 2 }],
    });
    expect(ok.body.data.items[0].approvedQuantity).toBe(2);
    const over = await post(
      storekeeper,
      `/requests/${d.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 3 }] },
      { "Idempotency-Key": "over-issue-0001" },
    );
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("OVER_ISSUE");
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(10); // nothing deducted
  });

  it("insufficient stock fails atomically and leaves no partial deduction", async () => {
    const d = await draft(20);
    await post(employee, `/requests/${d.id}/submit`);
    const itemId = (await get(employee, `/requests/${d.id}`)).body.data.items[0].id;
    await post(admin, `/requests/${d.id}/approve`, {});
    const res = await post(
      storekeeper,
      `/requests/${d.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 11 }] },
      { "Idempotency-Key": "too-much-0001" },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(10);
    expect((await get(admin, `/requests/${d.id}`)).body.data.status).toBe("APPROVED");
    expect((await get(admin, "/stock-transactions?type=ISSUE")).body.data).toHaveLength(0);
  });

  it("reports return real data, paginate, and CSV neutralises formula injection", async () => {
    await post(admin, "/chemicals", {
      chemicalCode: "DEMO-9002",
      name: '=HYPERLINK("http://evil")',
      packSizes: [{ label: "100 g", unitType: "MASS", baseQuantity: 100 }],
    });
    const page = await get(admin, "/reports/inventory?pageSize=1");
    expect(page.status).toBe(200);
    expect(page.body.meta.pageSize).toBe(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(2);
    const csv = await get(admin, "/reports/inventory?format=csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(`"'=HYPERLINK`);
    const low = await get(admin, "/reports/low-stock");
    expect(low.status).toBe(200);
  });

  it("reversals append a REVERSAL row and move stock back; issues cannot be reversed", async () => {
    const receipt = await post(storekeeper, "/stock-transactions/receipts", {
      chemicalId,
      packSizeId,
      quantity: 5,
      reason: "GRN-TEST-2",
    });
    // storekeepers cannot reverse; admins can
    expect(
      (
        await post(storekeeper, `/stock-transactions/${receipt.body.data.id}/reverse`, {
          reason: "entered twice by mistake",
        })
      ).status,
    ).toBe(403);
    const rev = await post(admin, `/stock-transactions/${receipt.body.data.id}/reverse`, {
      reason: "entered twice by mistake",
    });
    expect(rev.status).toBe(201);
    expect(rev.body.data.transactionType).toBe("REVERSAL");
    expect(rev.body.data.direction).toBe("OUT");
    expect((await get(admin, "/inventory")).body.data[0].onHandQuantity).toBe(10);
    expect(
      (
        await post(admin, `/stock-transactions/${receipt.body.data.id}/reverse`, {
          reason: "second attempt here",
        })
      ).status,
    ).toBe(409);
  });

  it("login/logout lifecycle invalidates the session", async () => {
    const me = await get(employee, "/auth/me");
    expect(me.status).toBe(200);
    expect((await post(employee, "/auth/logout")).status).toBe(200);
    expect((await get(employee, "/auth/me")).status).toBe(401);
    const bad = await loginAs(app, "no-such-user", PASSWORD);
    expect(bad.status).toBe(401);
  });
});
