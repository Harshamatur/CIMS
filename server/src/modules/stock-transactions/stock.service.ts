import { conflict, notFound, unprocessable } from "../../common/errors.js";
import { pageMeta, skipTake, type PageQuery } from "../../common/pagination.js";
import { signFor } from "../../common/quantity.js";
import { getPrisma, type Tx } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";
import { DECREMENT_STOCK_SQL, INCREMENT_STOCK_SQL } from "./sql.js";

type DirectType = "RECEIPT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

export const transactionInclude = {
  chemical: { select: { id: true, chemicalCode: true, name: true } },
  packSize: { select: { id: true, label: true, unitType: true } },
  actor: { select: { id: true, employeeCode: true, fullName: true } },
  requestItem: { select: { requestId: true } },
  reversalOf: { select: { transactionType: true } },
  reversedBy: { select: { id: true } },
} as const;

type TxRow = {
  id: string;
  createdAt: Date;
  transactionType: "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "REVERSAL";
  quantity: number;
  chemical: { id: string; chemicalCode: string; name: string };
  packSize: { id: string; label: string; unitType: string };
  requestItemId: string | null;
  requestItem: { requestId: string } | null;
  actor: { id: string; employeeCode: string; fullName: string };
  reason: string | null;
  reversalOfId: string | null;
  reversalOf: { transactionType: string } | null;
  reversedBy: { id: string } | null;
};

/** Direction is explicit in the DTO so no consumer has to guess whether a positive number is incoming or outgoing. */
export function toTransactionDto(r: TxRow) {
  const direction: "IN" | "OUT" =
    r.transactionType === "REVERSAL"
      ? signFor(r.reversalOf?.transactionType as "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT") ===
        1
        ? "OUT"
        : "IN"
      : signFor(r.transactionType) === 1
        ? "IN"
        : "OUT";
  return {
    id: r.id,
    createdAt: r.createdAt,
    transactionType: r.transactionType,
    direction,
    quantity: r.quantity,
    chemical: r.chemical,
    packSize: r.packSize,
    requestItemId: r.requestItemId,
    requestId: r.requestItem?.requestId ?? null,
    performedBy: r.actor,
    reason: r.reason,
    reversalOfId: r.reversalOfId,
    reversedById: r.reversedBy?.id ?? null,
  };
}

/** Applies a stock movement inside an existing transaction: conditional UPDATE first, ledger row second. */
export async function applyMovement(
  tx: Tx,
  args: { chemicalId: string; packSizeId: string; direction: "IN" | "OUT"; quantity: number },
): Promise<void> {
  const sql = args.direction === "IN" ? INCREMENT_STOCK_SQL : DECREMENT_STOCK_SQL;
  const updated = await tx.$executeRawUnsafe(sql, args.chemicalId, args.packSizeId, args.quantity);
  if (updated === 0) {
    if (args.direction === "IN") throw notFound("Inventory balance for this chemical and pack size");
    throw conflict("INSUFFICIENT_STOCK", "Not enough available stock for this operation.");
  }
}

async function readTransaction(db: Tx | ReturnType<typeof getPrisma>, id: string) {
  const row = await db.stockTransaction.findUnique({ where: { id }, include: transactionInclude });
  if (!row) throw notFound("Stock transaction");
  return toTransactionDto(row as unknown as TxRow);
}

async function replayIfKeyUsed(
  tx: Tx,
  key: string | undefined,
  expect: { chemicalId: string; packSizeId: string; type: string; quantity: number },
) {
  if (!key) return undefined;
  const existing = await tx.stockTransaction.findUnique({ where: { idempotencyKey: key } });
  if (!existing) return undefined;
  const same =
    existing.chemicalId === expect.chemicalId &&
    existing.packSizeId === expect.packSizeId &&
    existing.transactionType === expect.type &&
    existing.quantity === expect.quantity;
  if (!same)
    throw conflict(
      "IDEMPOTENCY_CONFLICT",
      "This Idempotency-Key was already used for a different operation.",
    );
  return existing.id;
}

export async function recordReceipt(
  ctx: ServiceContext,
  input: { chemicalId: string; packSizeId: string; quantity: number; reason: string },
  idempotencyKey?: string,
) {
  return recordDirect(ctx, "RECEIPT", "IN", input, idempotencyKey);
}

export async function recordAdjustment(
  ctx: ServiceContext,
  input: {
    chemicalId: string;
    packSizeId: string;
    quantity: number;
    reason: string;
    direction: "IN" | "OUT";
  },
  idempotencyKey?: string,
) {
  return recordDirect(
    ctx,
    input.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    input.direction,
    input,
    idempotencyKey,
  );
}

async function recordDirect(
  ctx: ServiceContext,
  type: DirectType,
  direction: "IN" | "OUT",
  input: { chemicalId: string; packSizeId: string; quantity: number; reason: string },
  idempotencyKey?: string,
) {
  if (!ctx.actorId) throw unprocessable("VALIDATION_ERROR", "An authenticated actor is required.");
  const db = getPrisma();
  const result = await db.$transaction(async (tx) => {
    const replay = await replayIfKeyUsed(tx, idempotencyKey, { ...input, type });
    if (replay) return { id: replay, replayed: true };
    await applyMovement(tx, { ...input, direction });
    const created = await tx.stockTransaction.create({
      data: {
        chemicalId: input.chemicalId,
        packSizeId: input.packSizeId,
        transactionType: type,
        quantity: input.quantity,
        performedBy: ctx.actorId as string,
        reason: input.reason,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
    await recordAudit(tx, ctx, {
      action: type === "RECEIPT" ? "STOCK_RECEIPT_RECORDED" : "STOCK_ADJUSTMENT_RECORDED",
      entityType: "stock_transaction",
      entityId: created.id,
      after: { type, direction, ...input },
    });
    return { id: created.id, replayed: false };
  });
  return { transaction: await readTransaction(db, result.id), replayed: result.replayed };
}

/** Corrections never edit history: a REVERSAL row is appended and stock is moved the opposite way. */
export async function reverseTransaction(ctx: ServiceContext, id: string, reason: string) {
  if (!ctx.actorId) throw unprocessable("VALIDATION_ERROR", "An authenticated actor is required.");
  const db = getPrisma();
  const newId = await db.$transaction(async (tx) => {
    const original = await tx.stockTransaction.findUnique({
      where: { id },
      include: { reversedBy: { select: { id: true } } },
    });
    if (!original) throw notFound("Stock transaction");
    if (original.transactionType === "ISSUE") {
      throw unprocessable(
        "INVALID_STATE_TRANSITION",
        "Issue transactions cannot be reversed in this prototype; record a justified adjustment instead.",
      );
    }
    if (original.transactionType === "REVERSAL")
      throw unprocessable("INVALID_STATE_TRANSITION", "A reversal cannot be reversed.");
    if (original.reversedBy) throw conflict("CONFLICT", "This transaction has already been reversed.");
    const originalDirection = signFor(original.transactionType) === 1 ? "IN" : "OUT";
    await applyMovement(tx, {
      chemicalId: original.chemicalId,
      packSizeId: original.packSizeId,
      direction: originalDirection === "IN" ? "OUT" : "IN",
      quantity: original.quantity,
    });
    // UNIQUE(reversal_of_id) makes a racing second reversal fail and roll the stock movement back.
    const created = await tx.stockTransaction.create({
      data: {
        chemicalId: original.chemicalId,
        packSizeId: original.packSizeId,
        transactionType: "REVERSAL",
        quantity: original.quantity,
        performedBy: ctx.actorId as string,
        reason,
        reversalOfId: original.id,
      },
    });
    await recordAudit(tx, ctx, {
      action: "STOCK_TRANSACTION_REVERSED",
      entityType: "stock_transaction",
      entityId: created.id,
      before: {
        reversedTransactionId: original.id,
        type: original.transactionType,
        quantity: original.quantity,
      },
      after: { reason },
    });
    return created.id;
  });
  return readTransaction(db, newId);
}

export async function listTransactions(
  q: PageQuery & {
    from?: string;
    to?: string;
    chemicalId?: string;
    packSizeId?: string;
    type?: string;
    performedBy?: string;
    requestId?: string;
  },
) {
  const where = {
    ...(q.chemicalId ? { chemicalId: q.chemicalId } : {}),
    ...(q.packSizeId ? { packSizeId: q.packSizeId } : {}),
    ...(q.type ? { transactionType: q.type as TxRow["transactionType"] } : {}),
    ...(q.performedBy ? { performedBy: q.performedBy } : {}),
    ...(q.requestId ? { requestItem: { requestId: q.requestId } } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(q.from) } : {}),
            ...(q.to ? { lte: new Date(q.to) } : {}),
          },
        }
      : {}),
  };
  const db = getPrisma();
  const [rows, total] = await Promise.all([
    db.stockTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: transactionInclude,
      ...skipTake(q),
    }),
    db.stockTransaction.count({ where }),
  ]);
  return { data: rows.map((r) => toTransactionDto(r as unknown as TxRow)), meta: pageMeta(q, total) };
}
