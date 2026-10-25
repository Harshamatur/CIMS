import { conflict, notFound, unprocessable } from "../../common/errors.js";
import type { Actor } from "../../common/permissions.js";
import { remainingToIssue } from "../../common/quantity.js";
import { assertTransition, deriveIssueStatus, type RequestStatus } from "../../common/state-machine.js";
import { getPrisma } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";
import { getRequestDetail, lockRequest } from "../requests/requests.service.js";
import { applyMovement } from "./stock.service.js";

export interface IssueLine {
  requestItemId: string;
  quantity: number;
}

/**
 * Records the physical hand-over of chemicals. ONE database transaction:
 *   lock request -> idempotency replay check -> state check -> per-line (remaining check, conditional stock decrement,
 *   ISSUE ledger row, issued_quantity) -> derive request status -> audit row.
 * Any failure rolls everything back, so no partial deduction can remain.
 *
 * Idempotency: the client supplies `Idempotency-Key`; each line is stored with the derived key `<key>:<requestItemId>`
 * (UNIQUE in the database). A retry with the same key and payload returns the original outcome and deducts nothing.
 */
export async function recordIssue(
  ctx: ServiceContext,
  actor: Actor,
  requestId: string,
  lines: readonly IssueLine[],
  idempotencyKey: string,
  note?: string,
) {
  const db = getPrisma();
  const derivedKey = (l: IssueLine) => `${idempotencyKey}:${l.requestItemId}`;

  const replayed = await db.$transaction(async (tx) => {
    const locked = await lockRequest(tx, requestId); // serialises issue/approve/cancel for this request
    // Visibility: a storekeeper must be able to see the request (APPROVED / PARTIALLY_ISSUED / ISSUED).
    if (
      !["APPROVED", "PARTIALLY_ISSUED", "ISSUED"].includes(locked.status) &&
      locked.requested_by !== actor.id
    ) {
      throw conflict(
        "INVALID_STATE_TRANSITION",
        `Request is ${locked.status}; only approved requests can be issued.`,
      );
    }

    // 1. Idempotency replay (checked BEFORE the state check so a retry after the final line still succeeds).
    const prior = await tx.stockTransaction.findMany({
      where: { idempotencyKey: { in: lines.map(derivedKey) } },
    });
    if (prior.length > 0) {
      const byKey = new Map(prior.map((p) => [p.idempotencyKey, p]));
      const identical =
        prior.length === lines.length &&
        lines.every((l) => {
          const p = byKey.get(derivedKey(l));
          return (
            p &&
            p.requestItemId === l.requestItemId &&
            p.quantity === l.quantity &&
            p.transactionType === "ISSUE"
          );
        });
      if (!identical)
        throw conflict(
          "IDEMPOTENCY_CONFLICT",
          "This Idempotency-Key was already used with a different payload.",
        );
      return true;
    }

    // 2. State check.
    const status = locked.status as RequestStatus;
    if (status !== "APPROVED" && status !== "PARTIALLY_ISSUED") {
      throw conflict("INVALID_STATE_TRANSITION", `A request in status ${status} cannot be issued.`);
    }

    // 3. Load and validate lines (ordered consistently so concurrent requests lock balance rows in the same order).
    const items = await tx.requestItem.findMany({ where: { requestId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const ordered = [...lines].sort((a, b) => {
      const ia = byId.get(a.requestItemId);
      const ib = byId.get(b.requestItemId);
      return `${ia?.chemicalId}${ia?.packSizeId}`.localeCompare(`${ib?.chemicalId}${ib?.packSizeId}`);
    });
    const before: Record<string, number> = Object.fromEntries(items.map((i) => [i.id, i.issuedQuantity]));

    for (const line of ordered) {
      const item = byId.get(line.requestItemId);
      if (!item)
        throw unprocessable(
          "VALIDATION_ERROR",
          "A line references an item that is not part of this request.",
        );
      const remaining = remainingToIssue(item.approvedQuantity, item.issuedQuantity);
      if (line.quantity > remaining) {
        throw unprocessable(
          "OVER_ISSUE",
          `Cannot issue ${line.quantity}: only ${remaining} approved pack(s) remain for this item.`,
          [{ path: `lines.${line.requestItemId}`, message: `remaining approved quantity is ${remaining}` }],
        );
      }

      // 4. Conditional stock decrement: 0 rows => insufficient available stock => whole transaction rolls back.
      await applyMovement(tx, {
        chemicalId: item.chemicalId,
        packSizeId: item.packSizeId,
        direction: "OUT",
        quantity: line.quantity,
      });

      // 5. Immutable ledger row + issued quantity.
      await tx.stockTransaction.create({
        data: {
          chemicalId: item.chemicalId,
          packSizeId: item.packSizeId,
          transactionType: "ISSUE",
          quantity: line.quantity,
          requestItemId: item.id,
          performedBy: actor.id,
          reason: note ?? null,
          idempotencyKey: derivedKey(line),
        },
      });
      await tx.requestItem.update({
        where: { id: item.id },
        data: { issuedQuantity: { increment: line.quantity } },
      });
    }

    // 6. Recompute overall status from the stored line items.
    const after = await tx.requestItem.findMany({
      where: { requestId },
      select: { id: true, approvedQuantity: true, issuedQuantity: true },
    });
    const next = deriveIssueStatus(after);
    if (next === "APPROVED") throw new Error("Invariant violated: an issue operation left nothing issued.");
    assertTransition(status, next);
    await tx.chemicalRequest.update({ where: { id: requestId }, data: { status: next } });

    await recordAudit(tx, ctx, {
      action: "STOCK_ISSUED",
      entityType: "chemical_request",
      entityId: requestId,
      before: { status, issuedByItem: before },
      after: {
        status: next,
        issuedByItem: Object.fromEntries(after.map((i) => [i.id, i.issuedQuantity])),
        lines,
        note: note ?? null,
      },
    });
    return false;
  });

  const request = await getRequestDetail(actor, requestId).catch((e: unknown) => {
    if (e instanceof Error && e.name === "AppError") throw notFound("Request");
    throw e;
  });
  return { request, replayed };
}
