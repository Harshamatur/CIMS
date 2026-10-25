/**
 * SECURITY AND CONCURRENCY SCENARIOS through the real API (supertest + PostgreSQL via Prisma).
 * STATUS: written, NOT EXECUTED in the authoring sandbox (Prisma Client could not be generated there).
 * The SQL-level equivalents of the concurrency scenarios DID run: see tests/db/concurrency.test.ts.
 */
import type { Express } from "express";
import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  HAS_PRISMA_CLIENT,
  PASSWORD,
  buildTestApp,
  createUserRow,
  get,
  loginAs,
  patch,
  post,
  type Session,
} from "../helpers/api.js";
import { assertMigrated, createTestPool, resetData } from "../helpers/pg.js";

describe.skipIf(!HAS_PRISMA_CLIENT)("security and integrity", () => {
  let app: Express;
  let pool: pg.Pool;
  let emp1: Session, emp2: Session, admin: Session, admin2: Session, sk: Session;
  let chemicalId: string, packSizeId: string;
  let emp1Row: { id: string; employeeCode: string };

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
    emp1Row = await createUserRow(pool, "EMPLOYEE");
    const emp2Row = await createUserRow(pool, "EMPLOYEE");
    const adminRow = await createUserRow(pool, "ADMIN");
    const admin2Row = await createUserRow(pool, "ADMIN");
    const skRow = await createUserRow(pool, "STOREKEEPER");
    emp1 = await loginAs(app, emp1Row.employeeCode);
    emp2 = await loginAs(app, emp2Row.employeeCode);
    admin = await loginAs(app, adminRow.employeeCode);
    admin2 = await loginAs(app, admin2Row.employeeCode);
    sk = await loginAs(app, skRow.employeeCode);
    const c = await post(admin, "/chemicals", {
      chemicalCode: "DEMO-7001",
      name: "Demo Sec Reagent",
      packSizes: [{ label: "500 ml", unitType: "VOLUME", baseQuantity: 500 }],
    });
    chemicalId = c.body.data.id;
    packSizeId = c.body.data.packSizes[0].id;
    await post(sk, "/stock-transactions/receipts", {
      chemicalId,
      packSizeId,
      quantity: 5,
      reason: "GRN-SEC-1",
    });
  });

  const submitted = async (who: Session, quantity = 2) => {
    const d = await post(who, "/requests", {
      purpose: "Security test request",
      items: [{ chemicalId, packSizeId, quantity }],
    });
    const s = await post(who, `/requests/${d.body.data.id}/submit`);
    return s.body.data as { id: string; items: { id: string }[] };
  };

  it("unauthenticated callers get 401 on protected routes", async () => {
    expect((await request(app).get("/api/v1/requests")).status).toBe(401);
    expect((await request(app).get("/api/v1/chemicals")).status).toBe(401);
  });

  it("state-changing requests without a valid CSRF token are refused, as are foreign origins", async () => {
    const noToken = await emp1.agent.post("/api/v1/requests").send({});
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe("CSRF_FAILED");
    const badOrigin = await emp1.agent
      .post("/api/v1/requests")
      .set("X-CSRF-Token", emp1.csrf)
      .set("Origin", "https://evil.example")
      .send({});
    expect(badOrigin.status).toBe(403);
  });

  it("employees cannot approve, reject, receive, adjust, issue, read audit logs or manage users", async () => {
    const r = await submitted(emp1);
    expect((await post(emp1, `/requests/${r.id}/approve`)).status).toBe(403);
    expect((await post(emp1, `/requests/${r.id}/reject`, { reason: "I reject my own request" })).status).toBe(
      403,
    );
    expect(
      (
        await post(emp1, "/stock-transactions/receipts", {
          chemicalId,
          packSizeId,
          quantity: 1,
          reason: "sneaky",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(emp1, "/stock-transactions/adjustments", {
          chemicalId,
          packSizeId,
          quantity: 1,
          direction: "IN",
          reason: "sneaky adjustment",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          emp1,
          `/requests/${r.id}/issue`,
          { lines: [{ requestItemId: r.items[0]!.id, quantity: 1 }] },
          { "Idempotency-Key": "emp-issue-0001" },
        )
      ).status,
    ).toBe(403);
    expect((await get(emp1, "/audit-logs")).status).toBe(403);
    expect((await get(emp1, "/users")).status).toBe(403);
    expect((await get(emp1, "/stock-transactions")).status).toBe(403);
    expect((await get(emp1, "/inventory")).status).toBe(403);
  });

  it("IDOR: another employee gets 404 for your request, and cannot edit, submit or cancel it", async () => {
    const r = await submitted(emp1);
    expect((await get(emp2, `/requests/${r.id}`)).status).toBe(404);
    expect((await post(emp2, `/requests/${r.id}/cancel`, {})).status).toBe(404);
    expect((await patch(emp2, `/requests/${r.id}`, { purpose: "hijacked purpose" })).status).toBe(404);
    expect((await get(emp2, "/requests")).body.data).toHaveLength(0);
    expect((await get(emp2, `/requests?requestedBy=${emp1.userId}`)).status).toBe(403);
  });

  it("admins cannot read other users' drafts, and storekeepers cannot see unapproved requests", async () => {
    const d = await post(emp1, "/requests", {
      purpose: "Still a private draft",
      items: [{ chemicalId, packSizeId, quantity: 1 }],
    });
    expect((await get(admin, `/requests/${d.body.data.id}`)).status).toBe(404);
    const s = await submitted(emp1);
    expect((await get(sk, `/requests/${s.id}`)).status).toBe(404);
  });

  it("nobody can approve their own request, even an administrator", async () => {
    const adminReq = await submitted(admin);
    const res = await post(admin, `/requests/${adminReq.id}/approve`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SELF_APPROVAL_FORBIDDEN");
    expect((await post(admin2, `/requests/${adminReq.id}/approve`)).status).toBe(200);
  });

  it("storekeepers cannot approve; admins cannot issue by default", async () => {
    const r = await submitted(emp1);
    expect((await post(sk, `/requests/${r.id}/approve`)).status).toBe(403);
    await post(admin, `/requests/${r.id}/approve`);
    const issue = await post(
      admin,
      `/requests/${r.id}/issue`,
      { lines: [{ requestItemId: r.items[0]!.id, quantity: 1 }] },
      { "Idempotency-Key": "admin-issue-0001" },
    );
    expect(issue.status).toBe(403);
  });

  it("an inactive account cannot log in and gets the same response as a wrong password", async () => {
    const inactive = await createUserRow(pool, "EMPLOYEE", "INACTIVE");
    const a = await loginAs(app, inactive.employeeCode);
    const b = await loginAs(app, emp1Row.employeeCode, "wrong-password-entirely");
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect((a.body as { error: { code: string; message: string } }).error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid credentials.",
    });
    expect((b.body as { error: { code: string; message: string } }).error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid credentials.",
    });
  });

  it("deactivating a user ends their existing session immediately", async () => {
    expect((await get(emp1, "/auth/me")).status).toBe(200);
    expect((await patch(admin, `/users/${emp1.userId}`, { status: "INACTIVE" })).status).toBe(200);
    expect((await get(emp1, "/auth/me")).status).toBe(401);
  });

  it("an administrator cannot demote or deactivate themselves", async () => {
    expect((await patch(admin, `/users/${admin.userId}`, { role: "EMPLOYEE" })).status).toBe(403);
    expect((await patch(admin, `/users/${admin.userId}`, { status: "INACTIVE" })).status).toBe(403);
  });

  it("mass assignment is rejected (status, requestedBy, approvedQuantity)", async () => {
    const res = await post(emp1, "/requests", {
      purpose: "Mass assignment probe",
      status: "APPROVED",
      requestedBy: emp2.userId,
      items: [{ chemicalId, packSizeId, quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("invalid quantities and invalid transitions are rejected", async () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(
        (
          await post(emp1, "/requests", {
            purpose: "Bad quantity probe",
            items: [{ chemicalId, packSizeId, quantity }],
          })
        ).status,
      ).toBe(400);
    }
    const d = await post(emp1, "/requests", {
      purpose: "Transition probe",
      items: [{ chemicalId, packSizeId, quantity: 1 }],
    });
    expect((await post(admin, `/requests/${d.body.data.id}/approve`)).status).toBe(404); // draft: invisible
    await post(emp1, `/requests/${d.body.data.id}/submit`);
    expect((await post(emp1, `/requests/${d.body.data.id}/submit`)).status).toBe(409); // double submit
    const itemId = (await get(emp1, `/requests/${d.body.data.id}`)).body.data.items[0].id;
    const early = await post(
      sk,
      `/requests/${d.body.data.id}/issue`,
      { lines: [{ requestItemId: itemId, quantity: 1 }] },
      { "Idempotency-Key": "before-approval-1" },
    );
    expect([404, 409]).toContain(early.status); // never succeeds before approval
  });

  it("concurrent reviewers: exactly one decision is applied", async () => {
    const r = await submitted(emp1);
    const results = await Promise.all([
      post(admin, `/requests/${r.id}/approve`),
      post(admin2, `/requests/${r.id}/reject`, { reason: "Rejected by the second reviewer" }),
      post(admin2, `/requests/${r.id}/approve`),
      post(admin, `/requests/${r.id}/reject`, { reason: "Rejected by the first reviewer" }),
    ]);
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(3);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM approval_actions WHERE request_id = $1::uuid",
      [r.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("concurrent issues against the same stock never produce negative stock or double deduction", async () => {
    // 5 packs in stock; three approved requests of 3 each compete. At most one can fully succeed.
    const reqs = [];
    for (let i = 0; i < 3; i++) {
      const r = await submitted(i % 2 ? emp1 : emp2, 3);
      await post(admin, `/requests/${r.id}/approve`);
      reqs.push(r);
    }
    const results = await Promise.all(
      reqs.map((r, i) =>
        post(
          sk,
          `/requests/${r.id}/issue`,
          { lines: [{ requestItemId: r.items[0]!.id, quantity: 3 }] },
          { "Idempotency-Key": `race-issue-000${i}` },
        ),
      ),
    );
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(2);
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(2);
  });

  it("the same Idempotency-Key sent in parallel deducts once", async () => {
    const r = await submitted(emp1, 4);
    await post(admin, `/requests/${r.id}/approve`);
    const body = { lines: [{ requestItemId: r.items[0]!.id, quantity: 2 }] };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        post(sk, `/requests/${r.id}/issue`, body, { "Idempotency-Key": "parallel-same-key" }),
      ),
    );
    expect(results.every((x) => x.status === 200)).toBe(true);
    const bal = await pool.query(
      "SELECT on_hand_quantity FROM inventory_balances WHERE pack_size_id = $1::uuid",
      [packSizeId],
    );
    expect(bal.rows[0].on_hand_quantity).toBe(3);
  });

  it("error responses carry a correlation id and never leak stack traces or SQL", async () => {
    const res = await get(emp1, "/requests/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers["x-request-id"]).toBe(res.body.error.requestId);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|select |at \w+ \(/i);
  });

  it("security headers are present and the readiness probe reveals nothing sensitive", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toBe('{"status":"ready"}');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("passwords never appear in any user DTO", async () => {
    const res = await get(admin, "/users");
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2/);
    void PASSWORD;
  });
});
