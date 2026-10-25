import { describe, expect, it } from "vitest";
import {
  assertPositiveInt,
  availableQuantity,
  remainingToIssue,
  resolveApprovedQuantities,
  signedDelta,
} from "../../src/common/quantity.js";

describe("stock sign convention", () => {
  it("adds for RECEIPT and ADJUSTMENT_IN, subtracts for ISSUE and ADJUSTMENT_OUT", () => {
    expect(signedDelta("RECEIPT", 4)).toBe(4);
    expect(signedDelta("ADJUSTMENT_IN", 4)).toBe(4);
    expect(signedDelta("ISSUE", 4)).toBe(-4);
    expect(signedDelta("ADJUSTMENT_OUT", 4)).toBe(-4);
  });
  it("a REVERSAL is the opposite of what it reverses", () => {
    expect(signedDelta("REVERSAL", 4, "RECEIPT")).toBe(-4);
    expect(signedDelta("REVERSAL", 4, "ADJUSTMENT_OUT")).toBe(4);
  });
  it("rejects non-positive or fractional quantities", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => assertPositiveInt(bad, "quantity")).toThrow();
    }
  });
  it("computes available stock and remaining-to-issue", () => {
    expect(availableQuantity(10, 3)).toBe(7);
    expect(remainingToIssue(5, 2)).toBe(3);
    expect(remainingToIssue(null, 0)).toBe(0);
    expect(remainingToIssue(2, 5)).toBe(0);
  });
});

describe("resolveApprovedQuantities", () => {
  const items = [
    { id: "a", requestedQuantity: 5 },
    { id: "b", requestedQuantity: 2 },
  ];
  it("defaults to the requested quantities", () => {
    expect([...resolveApprovedQuantities(items, undefined)]).toEqual([
      ["a", 5],
      ["b", 2],
    ]);
  });
  it("allows partial approval but never over-approval", () => {
    expect(resolveApprovedQuantities(items, [{ requestItemId: "a", approvedQuantity: 3 }]).get("a")).toBe(3);
    expect(() => resolveApprovedQuantities(items, [{ requestItemId: "a", approvedQuantity: 6 }])).toThrow(
      /between 0/,
    );
  });
  it("rejects unknown/duplicate items and all-zero approvals", () => {
    expect(() => resolveApprovedQuantities(items, [{ requestItemId: "zzz", approvedQuantity: 1 }])).toThrow();
    expect(() =>
      resolveApprovedQuantities(items, [
        { requestItemId: "a", approvedQuantity: 1 },
        { requestItemId: "a", approvedQuantity: 2 },
      ]),
    ).toThrow(/Duplicate/);
    expect(() =>
      resolveApprovedQuantities(items, [
        { requestItemId: "a", approvedQuantity: 0 },
        { requestItemId: "b", approvedQuantity: 0 },
      ]),
    ).toThrow(/reject the request/);
  });
});
