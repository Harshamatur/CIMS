import { conflict, forbidden, notFound, unprocessable } from "../../common/errors.js";
import { pageMeta, skipTake, type PageQuery } from "../../common/pagination.js";
import { requestVisibilityWhere, type Actor } from "../../common/permissions.js";
import { remainingToIssue } from "../../common/quantity.js";
import { assertTransition, REQUEST_STATUSES, type RequestStatus } from "../../common/state-machine.js";
import { getEnv } from "../../config/env.js";
import { getPrisma, type Tx } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";
import {
  LOCK_REQUEST_SQL,
  NEXT_REQUEST_SEQUENCE_SQL,
  formatRequestNumber,
} from "../stock-transactions/sql.js";

export interface ItemInput {
  chemicalId: string;
  packSizeId: string;
  quantity: number;
}

const person = { select: { id: true, employeeCode: true, fullName: true } } as const;

const detailInclude = {
  requester: person,
  decider: person,
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      chemical: { select: { id: true, chemicalCode: true, name: true, storageLocation: true } },
      packSize: {
        select: {
          id: true,
          label: true,
          unitType: true,
          balance: {
            select: { onHandQuantity: true, reservedQuantity: true, minimumQuantity: true },
          },
        },
      },
      stockTransactions: {
        where: { transactionType: "ISSUE" as const },
        orderBy: { createdAt: "asc" as const },
        include: { actor: person },
      },
    },
  },
  approvalActions: { orderBy: { createdAt: "asc" as const }, include: { reviewer: person } },
} as const;

type Person = { id: string; employeeCode: string; fullName: string };
type RequestRow = {
  id: string;
  requestNumber: string | null;
  status: RequestStatus;
  purpose: string;
  department: string | null;
  requester: Person;
  decider: Person | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const summaryBase = (r: RequestRow) => ({
  id: r.id,
  requestNumber: r.requestNumber,
  status: r.status,
  purpose: r.purpose,
  department: r.department,
  requester: r.requester,
  submittedAt: r.submittedAt,
  decidedAt: r.decidedAt,
  decidedBy: r.decider,
  rejectionReason: r.rejectionReason,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

/** Validates every line against CURRENT master data (active chemical + active pack size that belongs to it). */
export async function validateItems(tx: Tx, items: readonly ItemInput[]): Promise<void> {
  const max = getEnv().MAX_ITEM_QUANTITY;
  const packs = await tx.packSize.findMany({
    where: { id: { in: items.map((i) => i.packSizeId) } },
    include: { chemical: { select: { id: true, isActive: true, chemicalCode: true } } },
  });
  const byId = new Map(packs.map((p) => [p.id, p]));
  const problems: { path: string; message: string }[] = [];
  items.forEach((item, idx) => {
    const pack = byId.get(item.packSizeId);
    if (!pack || pack.chemicalId !== item.chemicalId) {
      problems.push({
        path: `items.${idx}.packSizeId`,
        message: "pack size does not exist for this chemical",
      });
      return;
    }
    if (!pack.chemical.isActive)
      problems.push({ path: `items.${idx}.chemicalId`, message: "chemical is inactive" });
    if (!pack.isActive) problems.push({ path: `items.${idx}.packSizeId`, message: "pack size is inactive" });
    if (item.quantity > max)
      problems.push({ path: `items.${idx}.quantity`, message: `exceeds the per-line limit of ${max}` });
  });
  if (problems.length) throw unprocessable("VALIDATION_ERROR", "One or more items are not valid.", problems);
}

export async function getRequestDetail(
  actor: Actor,
  id: string,
  db: Tx | ReturnType<typeof getPrisma> = getPrisma(),
) {
  // Visibility is part of the WHERE clause: a request you may not see is indistinguishable from one that does not exist.
  const row = await db.chemicalRequest.findFirst({
    where: { id, ...(requestVisibilityWhere(actor) as object) },
    include: detailInclude,
  });
  if (!row) throw notFound("Request");
  const r = row as unknown as RequestRow & {
    items: {
      id: string;
      requestedQuantity: number;
      approvedQuantity: number | null;
      issuedQuantity: number;
      chemical: { id: string; chemicalCode: string; name: string; storageLocation: string | null };
      packSize: {
        id: string;
        label: string;
        unitType: "MASS" | "VOLUME" | "COUNT";
        balance: { onHandQuantity: number; reservedQuantity: number; minimumQuantity: number } | null;
      };
      stockTransactions: { id: string; quantity: number; createdAt: Date; actor: Person }[];
    }[];
    approvalActions: {
      id: string;
      decision: "APPROVED" | "REJECTED";
      comments: string | null;
      createdAt: Date;
      reviewer: Person;
    }[];
  };
  return {
    ...summaryBase(r),
    itemCount: r.items.length,
    items: r.items.map((i) => ({
      id: i.id,
      chemical: i.chemical,
      packSize: { id: i.packSize.id, label: i.packSize.label, unitType: i.packSize.unitType },
      availability: i.packSize.balance
        ? {
            available: i.packSize.balance.onHandQuantity - i.packSize.balance.reservedQuantity,
            lowStock:
              i.packSize.balance.minimumQuantity > 0 &&
              i.packSize.balance.onHandQuantity - i.packSize.balance.reservedQuantity <=
                i.packSize.balance.minimumQuantity,
          }
        : null,
      requestedQuantity: i.requestedQuantity,
      approvedQuantity: i.approvedQuantity,
      issuedQuantity: i.issuedQuantity,
      remainingToIssue: remainingToIssue(i.approvedQuantity, i.issuedQuantity),
    })),
    approvalActions: r.approvalActions,
    issues: r.items
      .flatMap((i) =>
        i.stockTransactions.map((t) => ({
          id: t.id,
          requestItemId: i.id,
          quantity: t.quantity,
          createdAt: t.createdAt,
          performedBy: t.actor,
        })),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}

export async function listRequests(
  actor: Actor,
  q: PageQuery & { status?: RequestStatus[]; q?: string; from?: string; to?: string; requestedBy?: string },
) {
  const filters: Record<string, unknown>[] = [requestVisibilityWhere(actor)];
  if (q.status?.length) filters.push({ status: { in: q.status } });
  if (q.q) filters.push({ requestNumber: { contains: q.q.toUpperCase().replace(/[\\%_]/g, "") } });
  // Only ADMIN may look at other people's requests through this filter; for others visibility already narrows it.
  if (q.requestedBy) filters.push({ requestedBy: q.requestedBy });
  if (q.from || q.to) {
    filters.push({
      createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) },
    });
  }
  const where = { AND: filters } as object;
  const db = getPrisma();
  const [rows, total] = await Promise.all([
    db.chemicalRequest.findMany({
      where,
      orderBy: [{ submittedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      include: { requester: person, decider: person, _count: { select: { items: true } } },
      ...skipTake(q),
    }),
    db.chemicalRequest.count({ where }),
  ]);
  return {
    data: rows.map((row) => ({
      ...summaryBase(row as unknown as RequestRow),
      itemCount: (row as unknown as { _count: { items: number } })._count.items,
    })),
    meta: pageMeta(q, total),
  };
}

export async function countRequests(actor: Actor, requestedBy?: string) {
  const where = {
    AND: [requestVisibilityWhere(actor), ...(requestedBy ? [{ requestedBy }] : [])],
  };
  const grouped = await getPrisma().chemicalRequest.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts = Object.fromEntries(REQUEST_STATUSES.map((status) => [status, 0])) as Record<
    RequestStatus,
    number
  >;
  for (const row of grouped) counts[row.status] = row._count._all;
  return { data: counts };
}

export async function createDraft(
  ctx: ServiceContext,
  actor: Actor,
  input: { purpose: string; department?: string; items: ItemInput[] },
) {
  const db = getPrisma();
  const id = await db.$transaction(async (tx) => {
    await validateItems(tx, input.items);
    const created = await tx.chemicalRequest.create({
      data: {
        requestedBy: actor.id,
        purpose: input.purpose,
        department: input.department ?? null,
        status: "DRAFT",
        items: {
          create: input.items.map((i) => ({
            chemicalId: i.chemicalId,
            packSizeId: i.packSizeId,
            requestedQuantity: i.quantity,
          })),
        },
      },
    });
    await recordAudit(tx, ctx, {
      action: "REQUEST_DRAFT_CREATED",
      entityType: "chemical_request",
      entityId: created.id,
      after: input,
    });
    return created.id;
  });
  return getRequestDetail(actor, id);
}

async function lockRequest(
  tx: Tx,
  id: string,
): Promise<{ id: string; status: RequestStatus; requested_by: string }> {
  const rows = await tx.$queryRawUnsafe<{ id: string; status: RequestStatus; requested_by: string }[]>(
    LOCK_REQUEST_SQL,
    id,
  );
  const row = rows[0];
  if (!row) throw notFound("Request");
  return row;
}
export { lockRequest };

export async function updateDraft(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  patch: { purpose?: string; department?: string | null; items?: ItemInput[] },
) {
  await getPrisma().$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    if (locked.requested_by !== actor.id) throw notFound("Request"); // do not reveal other people's requests
    if (locked.status !== "DRAFT")
      throw conflict("INVALID_STATE_TRANSITION", "Only draft requests can be edited.");
    if (patch.items) {
      await validateItems(tx, patch.items);
      await tx.requestItem.deleteMany({ where: { requestId: id } });
      await tx.requestItem.createMany({
        data: patch.items.map((i) => ({
          requestId: id,
          chemicalId: i.chemicalId,
          packSizeId: i.packSizeId,
          requestedQuantity: i.quantity,
        })),
      });
    }
    await tx.chemicalRequest.update({
      where: { id },
      data: {
        ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}),
        ...(patch.department !== undefined ? { department: patch.department } : {}),
      },
    });
    await recordAudit(tx, ctx, {
      action: "REQUEST_DRAFT_UPDATED",
      entityType: "chemical_request",
      entityId: id,
      after: patch,
    });
  });
  return getRequestDetail(actor, id);
}

export async function submitRequest(ctx: ServiceContext, actor: Actor, id: string) {
  await getPrisma().$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    if (locked.requested_by !== actor.id) throw notFound("Request");
    assertTransition(locked.status, "SUBMITTED"); // a second submit of the same request is a 409, never a duplicate
    const items = await tx.requestItem.findMany({ where: { requestId: id } });
    if (items.length === 0) throw unprocessable("VALIDATION_ERROR", "A request needs at least one item.");
    await validateItems(
      tx,
      items.map((i) => ({
        chemicalId: i.chemicalId,
        packSizeId: i.packSizeId,
        quantity: i.requestedQuantity,
      })),
    );
    const seq = await tx.$queryRawUnsafe<{ n: string }[]>(NEXT_REQUEST_SEQUENCE_SQL);
    const requestNumber = formatRequestNumber(seq[0]?.n ?? "0");
    const now = new Date();
    await tx.chemicalRequest.update({
      where: { id },
      data: { status: "SUBMITTED", requestNumber, submittedAt: now },
    });
    await recordAudit(tx, ctx, {
      action: "REQUEST_SUBMITTED",
      entityType: "chemical_request",
      entityId: id,
      before: { status: locked.status },
      after: { status: "SUBMITTED", requestNumber, itemCount: items.length },
    });
  });
  return getRequestDetail(actor, id);
}

export async function cancelRequest(ctx: ServiceContext, actor: Actor, id: string, reason?: string) {
  await getPrisma().$transaction(async (tx) => {
    const locked = await lockRequest(tx, id);
    const isOwner = locked.requested_by === actor.id;
    if (!isOwner && actor.role !== "ADMIN") throw notFound("Request");
    if (!isOwner && locked.status === "DRAFT") throw notFound("Request");
    if (isOwner && actor.role !== "ADMIN" && !["DRAFT", "SUBMITTED"].includes(locked.status)) {
      throw forbidden("You can only cancel your own request before it is approved; ask an administrator.");
    }
    assertTransition(locked.status, "CANCELLED");
    if (locked.status === "APPROVED") {
      const issued = await tx.requestItem.count({ where: { requestId: id, issuedQuantity: { gt: 0 } } });
      if (issued > 0)
        throw conflict("INVALID_STATE_TRANSITION", "Stock has already been issued against this request.");
    }
    await tx.chemicalRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit(tx, ctx, {
      action: "REQUEST_CANCELLED",
      entityType: "chemical_request",
      entityId: id,
      before: { status: locked.status },
      after: { status: "CANCELLED", reason: reason ?? null },
    });
  });
  return getRequestDetail(actor, id);
}
