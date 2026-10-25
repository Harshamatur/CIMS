import { describe, expect, it } from "vitest";
import {
  REQUEST_STATUSES,
  assertTransition,
  canTransition,
  deriveIssueStatus,
  isTerminal,
} from "../../src/common/state-machine.js";

describe("request state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransition("APPROVED", "PARTIALLY_ISSUED")).toBe(true);
    expect(canTransition("APPROVED", "ISSUED")).toBe(true);
    expect(canTransition("PARTIALLY_ISSUED", "ISSUED")).toBe(true);
  });

  it("rejects skipping review or re-deciding", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("DRAFT", "ISSUED")).toBe(false);
    expect(canTransition("SUBMITTED", "ISSUED")).toBe(false);
    expect(canTransition("APPROVED", "REJECTED")).toBe(false);
    expect(canTransition("APPROVED", "APPROVED")).toBe(false);
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
  });

  it("treats REJECTED, ISSUED and CANCELLED as terminal", () => {
    for (const s of ["REJECTED", "ISSUED", "CANCELLED"] as const) {
      expect(isTerminal(s)).toBe(true);
      for (const to of REQUEST_STATUSES) expect(canTransition(s, to)).toBe(false);
    }
  });

  it("does not allow cancelling once partially issued", () => {
    expect(canTransition("PARTIALLY_ISSUED", "CANCELLED")).toBe(false);
  });

  it("assertTransition throws a 409 INVALID_STATE_TRANSITION", () => {
    try {
      assertTransition("REJECTED", "APPROVED");
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ status: 409, code: "INVALID_STATE_TRANSITION" });
    }
  });
});

describe("deriveIssueStatus", () => {
  it("is APPROVED when nothing was issued", () => {
    expect(deriveIssueStatus([{ approvedQuantity: 5, issuedQuantity: 0 }])).toBe("APPROVED");
  });
  it("is PARTIALLY_ISSUED when some approved quantity remains", () => {
    expect(
      deriveIssueStatus([
        { approvedQuantity: 5, issuedQuantity: 5 },
        { approvedQuantity: 2, issuedQuantity: 1 },
      ]),
    ).toBe("PARTIALLY_ISSUED");
  });
  it("is ISSUED when every approved line is fully issued, ignoring zero-approved lines", () => {
    expect(
      deriveIssueStatus([
        { approvedQuantity: 5, issuedQuantity: 5 },
        { approvedQuantity: 0, issuedQuantity: 0 },
      ]),
    ).toBe("ISSUED");
  });
});
