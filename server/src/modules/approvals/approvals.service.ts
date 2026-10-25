import { conflict, notFound } from "../../common/errors.js";
import { resolveApprovedQuantities } from "../../common/quantity.js";
import type { Actor } from "../../common/permissions.js";
import { assertTransition, type RequestStatus } from "../../common/state-machine.js";
import { getPrisma } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";
import { getRequestDetail, lockRequest } from "../requests/requests.service.js";
import { forbiddenSelfApproval } from "./self-approval.js";

/**
 * Both decisions follow the same protocol:
 *  1. SELECT ... FOR UPDATE on the request row — concurrent reviewers queue up here.
 *  2. Status must still be SUBMITTED, otherwise 409 ALREADY_DECIDED (never a second silent decision).
 *  3. Reviewer must not be the requester.
 *  4. approval_actions row + request update + audit row commit together; UNIQUE(request_id) is the last line of defence.
 */
export async function approveRequest(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: { comments?: string; approvedQuantities?: { requestItemId: string; approvedQuantity: number }[] },
) {
  await getPrisma().$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    await guard(locked.status, locked.requested_by, actor, "APPROVED");
    const items = await tx.requestItem.findMany({
      where: { requestId: id },
      select: { id: true, requestedQuantity: true },
    });
    const approved = resolveApprovedQuantities(items, input.approvedQuantities);
    for (const [itemId, qty] of approved) {
      await tx.requestItem.update({ where: { id: itemId }, data: { approvedQuantity: qty } });
    }
    await tx.approvalAction.create({
      data: { requestId: id, reviewedBy: actor.id, decision: "APPROVED", comments: input.comments ?? null },
    });
    await tx.chemicalRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedBy: actor.id, decidedAt: new Date() },
    });
    await recordAudit(tx, ctx, {
      action: "REQUEST_APPROVED",
      entityType: "chemical_request",
      entityId: id,
      before: { status: locked.status },
      after: {
        status: "APPROVED",
        approvedQuantities: Object.fromEntries(approved),
        comments: input.comments ?? null,
      },
    });
  });
  return getRequestDetail(actor, id);
}

export async function rejectRequest(ctx: ServiceContext, actor: Actor, id: string, reason: string) {
  await getPrisma().$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    await guard(locked.status, locked.requested_by, actor, "REJECTED");
    await tx.approvalAction.create({
      data: { requestId: id, reviewedBy: actor.id, decision: "REJECTED", comments: reason },
    });
    await tx.chemicalRequest.update({
      where: { id },
      data: { status: "REJECTED", decidedBy: actor.id, decidedAt: new Date(), rejectionReason: reason },
    });
    await recordAudit(tx, ctx, {
      action: "REQUEST_REJECTED",
      entityType: "chemical_request",
      entityId: id,
      before: { status: locked.status },
      after: { status: "REJECTED", reason },
    });
  });
  return getRequestDetail(actor, id);
}

async function guard(
  status: RequestStatus,
  requesterId: string,
  actor: Actor,
  to: "APPROVED" | "REJECTED",
): Promise<void> {
  if (status === "DRAFT") throw notFound("Request"); // drafts are private to their owner
  if (status !== "SUBMITTED") {
    if (["APPROVED", "REJECTED"].includes(status) || ["PARTIALLY_ISSUED", "ISSUED"].includes(status)) {
      throw conflict("ALREADY_DECIDED", `This request has already been decided (current status: ${status}).`);
    }
    assertTransition(status, to);
  }
  if (requesterId === actor.id) throw forbiddenSelfApproval();
}
