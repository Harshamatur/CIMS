import { describe, expect, it } from "vitest";
import { approveBody, rejectBody } from "../../src/modules/approvals/approvals.schemas.js";
import { createChemicalBody, packSizeInput } from "../../src/modules/chemicals/chemicals.schemas.js";
import {
  cancelBody,
  createRequestBody,
  listRequestsQuery,
  updateRequestBody,
} from "../../src/modules/requests/requests.schemas.js";
import {
  adjustmentBody,
  issueBody,
  receiptBody,
} from "../../src/modules/stock-transactions/stock.schemas.js";
import { createUserBody, updateUserBody } from "../../src/modules/users/users.schemas.js";
import { idempotencyKeyHeader } from "../../src/common/schemas.js";
import { loginBody } from "../../src/modules/auth/auth.schemas.js";

const A = "6f1c2f0e-8d36-4a77-9d0e-0d0b5f4d0a11";
const B = "7a2d3a1f-9e47-4b88-8e1f-1e1c6a5e1b22";
const C = "8b3e4b20-af58-4c99-9f20-2f2d7b6f2c33";
const line = (packSizeId = B, quantity = 2) => ({ chemicalId: A, packSizeId, quantity });

describe("request creation schema", () => {
  it("accepts a multi-item request", () => {
    const r = createRequestBody.safeParse({ purpose: "Boiler water analysis", items: [line(B), line(C, 1)] });
    expect(r.success).toBe(true);
  });
  it("rejects zero, negative, fractional and absurd quantities", () => {
    for (const quantity of [0, -3, 1.5, 1_000_001]) {
      expect(
        createRequestBody.safeParse({ purpose: "Boiler water analysis", items: [line(B, quantity)] }).success,
      ).toBe(false);
    }
  });
  it("rejects empty item lists and duplicate pack sizes", () => {
    expect(createRequestBody.safeParse({ purpose: "Boiler water analysis", items: [] }).success).toBe(false);
    expect(
      createRequestBody.safeParse({ purpose: "Boiler water analysis", items: [line(B), line(B, 5)] }).success,
    ).toBe(false);
  });
  it("blocks mass assignment: unknown fields such as status or requestedBy are rejected", () => {
    const base = { purpose: "Boiler water analysis", items: [line()] };
    expect(createRequestBody.safeParse({ ...base, status: "APPROVED" }).success).toBe(false);
    expect(createRequestBody.safeParse({ ...base, requestedBy: A }).success).toBe(false);
    expect(
      createRequestBody.safeParse({ ...base, items: [{ ...line(), approvedQuantity: 99 }] }).success,
    ).toBe(false);
    expect(updateRequestBody.safeParse({ status: "ISSUED" }).success).toBe(false);
  });
  it("requires a real purpose and a UUID for identifiers", () => {
    expect(createRequestBody.safeParse({ purpose: "x", items: [line()] }).success).toBe(false);
    expect(
      createRequestBody.safeParse({
        purpose: "Valid purpose",
        items: [{ ...line(), chemicalId: "not-a-uuid" }],
      }).success,
    ).toBe(false);
  });
  it("cancel reason is optional but bounded", () => {
    expect(cancelBody.safeParse({}).success).toBe(true);
    expect(cancelBody.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("approval schemas", () => {
  it("rejection needs a meaningful reason (>= 10 chars after trimming)", () => {
    expect(rejectBody.safeParse({ reason: "no" }).success).toBe(false);
    expect(rejectBody.safeParse({ reason: "         " }).success).toBe(false);
    expect(rejectBody.safeParse({ reason: "Not required for this analysis" }).success).toBe(true);
  });
  it("approval accepts optional partial quantities but not negatives or unknown keys", () => {
    expect(approveBody.safeParse({}).success).toBe(true);
    expect(
      approveBody.safeParse({ approvedQuantities: [{ requestItemId: A, approvedQuantity: 0 }] }).success,
    ).toBe(true);
    expect(
      approveBody.safeParse({ approvedQuantities: [{ requestItemId: A, approvedQuantity: -1 }] }).success,
    ).toBe(false);
    expect(approveBody.safeParse({ decidedBy: A }).success).toBe(false);
  });
});

describe("stock operation schemas", () => {
  it("receipt needs a reference; adjustment needs a real reason and a direction", () => {
    const base = { chemicalId: A, packSizeId: B, quantity: 5 };
    expect(receiptBody.safeParse({ ...base, reason: "GRN-1" }).success).toBe(true);
    expect(receiptBody.safeParse({ ...base, reason: "" }).success).toBe(false);
    expect(adjustmentBody.safeParse({ ...base, direction: "OUT", reason: "short" }).success).toBe(false);
    expect(
      adjustmentBody.safeParse({ ...base, direction: "SIDEWAYS", reason: "Recount after audit" }).success,
    ).toBe(false);
    expect(
      adjustmentBody.safeParse({ ...base, direction: "OUT", reason: "Recount after audit" }).success,
    ).toBe(true);
    expect(receiptBody.safeParse({ ...base, quantity: 0, reason: "GRN-1" }).success).toBe(false);
  });
  it("issue lines must be unique, positive and non-empty", () => {
    expect(issueBody.safeParse({ lines: [{ requestItemId: A, quantity: 1 }] }).success).toBe(true);
    expect(issueBody.safeParse({ lines: [] }).success).toBe(false);
    expect(issueBody.safeParse({ lines: [{ requestItemId: A, quantity: 0 }] }).success).toBe(false);
    expect(
      issueBody.safeParse({
        lines: [
          { requestItemId: A, quantity: 1 },
          { requestItemId: A, quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("idempotency keys are length- and charset-restricted", () => {
    expect(idempotencyKeyHeader.safeParse({ "idempotency-key": "6f1c2f0e-8d36-4a77-9d0e" }).success).toBe(
      true,
    );
    expect(idempotencyKeyHeader.safeParse({ "idempotency-key": "short" }).success).toBe(false);
    expect(idempotencyKeyHeader.safeParse({ "idempotency-key": "has spaces and <tags> !!" }).success).toBe(
      false,
    );
    expect(idempotencyKeyHeader.safeParse({}).success).toBe(false);
  });
});

describe("master-data schemas", () => {
  it("pack sizes accept up to 3 decimals and reject unit mixing by construction (unit derived server-side)", () => {
    expect(packSizeInput.safeParse({ label: "2.5 L", unitType: "VOLUME", baseQuantity: 2500 }).success).toBe(
      true,
    );
    expect(packSizeInput.safeParse({ label: "x", unitType: "MASS", baseQuantity: 0.0005 }).success).toBe(
      false,
    );
    expect(
      packSizeInput.safeParse({ label: "x", unitType: "MASS", baseQuantity: 100, baseUnit: "ml" }).success,
    ).toBe(false);
    expect(packSizeInput.safeParse({ label: "x", unitType: "LITRES", baseQuantity: 1 }).success).toBe(false);
  });
  it("chemical creation rejects duplicate pack labels and bad codes", () => {
    const pack = { label: "500 ml", unitType: "VOLUME", baseQuantity: 500 };
    expect(
      createChemicalBody.safeParse({
        chemicalCode: "DEMO-001",
        name: "Demo Acid",
        packSizes: [pack, { ...pack, baseQuantity: 250 }],
      }).success,
    ).toBe(false);
    expect(createChemicalBody.safeParse({ chemicalCode: "bad code!", name: "Demo Acid" }).success).toBe(
      false,
    );
    expect(
      createChemicalBody.safeParse({ chemicalCode: "DEMO-001", name: "Demo Acid", isActive: false }).success,
    ).toBe(false);
  });
});

describe("user and auth schemas", () => {
  it("enforces password policy and blocks role/status injection on creation", () => {
    const base = { employeeCode: "EMP-1", fullName: "Demo User", role: "EMPLOYEE" };
    expect(createUserBody.safeParse({ ...base, initialPassword: "short" }).success).toBe(false);
    expect(createUserBody.safeParse({ ...base, initialPassword: "a-long-enough-passphrase" }).success).toBe(
      true,
    );
    expect(
      createUserBody.safeParse({
        ...base,
        initialPassword: "a-long-enough-passphrase",
        status: "LOCKED",
        passwordHash: "x",
      }).success,
    ).toBe(false);
    expect(updateUserBody.safeParse({}).success).toBe(false);
  });
  it("normalises email to lower case", () => {
    const r = createUserBody.parse({
      employeeCode: "EMP-2",
      fullName: "Demo User",
      role: "ADMIN",
      email: " Demo.User@Example.ORG ",
      initialPassword: "a-long-enough-passphrase",
    });
    expect(r.email).toBe("demo.user@example.org");
  });
  it("login body has no extra fields", () => {
    expect(loginBody.safeParse({ identifier: "EMP-1", password: "x", role: "ADMIN" }).success).toBe(false);
  });
});

describe("request list query", () => {
  it("parses comma-separated statuses and rejects unknown ones", () => {
    expect(listRequestsQuery.parse({ status: "APPROVED,PARTIALLY_ISSUED" }).status).toEqual([
      "APPROVED",
      "PARTIALLY_ISSUED",
    ]);
    expect(listRequestsQuery.safeParse({ status: "APPROVED,HACKED" }).success).toBe(false);
  });
  it("applies pagination defaults and caps page size at 100", () => {
    expect(listRequestsQuery.parse({})).toMatchObject({ page: 1, pageSize: 25 });
    expect(listRequestsQuery.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(listRequestsQuery.safeParse({ page: "0" }).success).toBe(false);
  });
});
