import { describe, expect, it } from "vitest";
import { can, canViewRequest, issueRoles, requestVisibilityWhere } from "../../src/common/permissions.js";

describe("role permissions", () => {
  it("employees cannot review, adjust stock, issue or read audit logs", () => {
    for (const a of [
      "requests:review",
      "stock:adjust",
      "stock:receipt",
      "stock:read",
      "audit:read",
      "users:manage",
    ] as const) {
      expect(can("EMPLOYEE", a)).toBe(false);
    }
  });
  it("only ADMIN reviews requests and reads audit logs", () => {
    expect(can("ADMIN", "requests:review")).toBe(true);
    expect(can("STOREKEEPER", "requests:review")).toBe(false);
    expect(can("STOREKEEPER", "audit:read")).toBe(false);
  });
  it("issue is storekeeper-only by default (separation of duties)", () => {
    expect(issueRoles(false)).toEqual(["STOREKEEPER"]);
    expect(issueRoles(true)).toContain("ADMIN");
  });
});

describe("request object-level visibility", () => {
  const me = { id: "u1", role: "EMPLOYEE" as const };
  it("employees see only their own requests", () => {
    expect(canViewRequest(me, { requestedBy: "u1", status: "DRAFT" })).toBe(true);
    expect(canViewRequest(me, { requestedBy: "u2", status: "SUBMITTED" })).toBe(false);
    expect(requestVisibilityWhere(me)).toEqual({ requestedBy: "u1" });
  });
  it("admins never see other people's drafts", () => {
    const admin = { id: "a1", role: "ADMIN" as const };
    expect(canViewRequest(admin, { requestedBy: "u2", status: "DRAFT" })).toBe(false);
    expect(canViewRequest(admin, { requestedBy: "u2", status: "SUBMITTED" })).toBe(true);
    expect(canViewRequest(admin, { requestedBy: "a1", status: "DRAFT" })).toBe(true);
  });
  it("storekeepers only see approved/issued work", () => {
    const sk = { id: "s1", role: "STOREKEEPER" as const };
    expect(canViewRequest(sk, { requestedBy: "u2", status: "SUBMITTED" })).toBe(false);
    expect(canViewRequest(sk, { requestedBy: "u2", status: "APPROVED" })).toBe(true);
    expect(canViewRequest(sk, { requestedBy: "u2", status: "REJECTED" })).toBe(false);
  });
});
