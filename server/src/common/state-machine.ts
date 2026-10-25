import { conflict } from "./errors.js";

export const REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "PARTIALLY_ISSUED",
  "ISSUED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Explicit request lifecycle. Anything not listed here is rejected.
 *   DRAFT -> SUBMITTED -> APPROVED | REJECTED
 *   APPROVED -> PARTIALLY_ISSUED -> ISSUED   (APPROVED -> ISSUED when issued in one go)
 *   DRAFT | SUBMITTED | APPROVED(nothing issued yet) -> CANCELLED
 * REJECTED, ISSUED and CANCELLED are terminal.
 */
const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PARTIALLY_ISSUED", "ISSUED", "CANCELLED"],
  PARTIALLY_ISSUED: ["PARTIALLY_ISSUED", "ISSUED"],
  REJECTED: [],
  ISSUED: [],
  CANCELLED: [],
};

export const canTransition = (from: RequestStatus, to: RequestStatus): boolean =>
  TRANSITIONS[from].includes(to);

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!canTransition(from, to)) {
    throw conflict("INVALID_STATE_TRANSITION", `A request in status ${from} cannot move to ${to}.`);
  }
}

export const isTerminal = (s: RequestStatus): boolean => TRANSITIONS[s].length === 0;

export interface IssueProgressItem {
  approvedQuantity: number | null;
  issuedQuantity: number;
}

/** Overall status after an issue operation, derived from line items. Only meaningful for approved requests. */
export function deriveIssueStatus(
  items: readonly IssueProgressItem[],
): "APPROVED" | "PARTIALLY_ISSUED" | "ISSUED" {
  const lines = items.filter((i) => (i.approvedQuantity ?? 0) > 0);
  const anyIssued = lines.some((i) => i.issuedQuantity > 0);
  const allDone = lines.length > 0 && lines.every((i) => i.issuedQuantity >= (i.approvedQuantity ?? 0));
  if (allDone) return "ISSUED";
  return anyIssued ? "PARTIALLY_ISSUED" : "APPROVED";
}
