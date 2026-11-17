import type { Actor } from "../../common/permissions.js";
import { requestVisibilityWhere } from "../../common/permissions.js";
import { getEnv } from "../../config/env.js";
import { getPrisma } from "../../db/client.js";
import { listRequests } from "../requests/requests.service.js";
import { listTransactions } from "../stock-transactions/stock.service.js";

function localDayStart(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (items: Intl.DateTimeFormatPart[], type: string) => Number(items.find((p) => p.type === type)?.value);
  const midnight = Date.UTC(part(parts, "year"), part(parts, "month") - 1, part(parts, "day"));
  let guess = midnight;
  for (let i = 0; i < 2; i += 1) {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const represented = Date.UTC(part(local, "year"), part(local, "month") - 1, part(local, "day"), part(local, "hour"), part(local, "minute"), part(local, "second"));
    guess += midnight - represented;
  }
  return new Date(guess);
}

async function lowStockCount(): Promise<number> {
  const rows = await getPrisma().$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
      FROM inventory_balances b
      JOIN chemicals c ON c.id = b.chemical_id
      JOIN pack_sizes p ON p.id = b.pack_size_id
     WHERE c.is_active = true AND p.is_active = true
       AND b.minimum_quantity > 0
       AND b.on_hand_quantity - b.reserved_quantity <= b.minimum_quantity`;
  return Number(rows[0]?.count ?? 0);
}

async function lowStockItems() {
  return getPrisma().$queryRaw<{ chemicalCode: string; chemicalName: string; packLabel: string; availableQuantity: number; minimumQuantity: number }[]>`
    SELECT c.chemical_code AS "chemicalCode", c.name AS "chemicalName", p.label AS "packLabel",
           (b.on_hand_quantity - b.reserved_quantity) AS "availableQuantity", b.minimum_quantity AS "minimumQuantity"
      FROM inventory_balances b
      JOIN chemicals c ON c.id = b.chemical_id
      JOIN pack_sizes p ON p.id = b.pack_size_id
     WHERE c.is_active = true AND p.is_active = true AND b.minimum_quantity > 0
       AND b.on_hand_quantity - b.reserved_quantity <= b.minimum_quantity
     ORDER BY (b.on_hand_quantity - b.reserved_quantity) ASC, c.chemical_code ASC
     LIMIT 5`;
}

export async function getDashboardSummary(actor: Actor) {
  const db = getPrisma();
  const grouped = await db.chemicalRequest.groupBy({ by: ["status"], where: requestVisibilityWhere(actor), _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Record<string, number>;
  const get = (status: string) => counts[status] ?? 0;

  if (actor.role === "EMPLOYEE") {
    return { data: { role: actor.role, awaitingReview: get("SUBMITTED"), approved: get("APPROVED"), partiallyIssued: get("PARTIALLY_ISSUED"), fullyIssued: get("ISSUED") } };
  }
  if (actor.role === "ADMIN") {
    const [lowStockAlerts, pending, activity, lowItems, transactions] = await Promise.all([
      lowStockCount(),
      listRequests(actor, { page: 1, pageSize: 5, status: ["SUBMITTED"] }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { actor: { select: { fullName: true } } } }),
      lowStockItems(),
      listTransactions({ page: 1, pageSize: 5 }),
    ]);
    return { data: {
      role: actor.role,
      totalRequests: Object.values(counts).reduce((sum, value) => sum + value, 0),
      awaitingDecision: get("SUBMITTED"), approved: get("APPROVED"),
      partiallyIssued: get("PARTIALLY_ISSUED"), fullyIssued: get("ISSUED"), rejected: get("REJECTED"), lowStockAlerts,
      pendingRequests: pending.data,
      recentActivity: activity.map((row) => ({ id: row.id, action: row.action, entityType: row.entityType, createdAt: row.createdAt.toISOString(), actorName: row.actor?.fullName ?? null })),
      lowStockItems: lowItems,
      recentTransactions: transactions.data,
    } };
  }

  const start = localDayStart(new Date(), getEnv().BUSINESS_TIMEZONE);
  const [issueLines, lowStockAlerts, pending, handovers, lowItems, transactions] = await Promise.all([
    db.stockTransaction.findMany({
      where: { transactionType: "ISSUE", createdAt: { gte: start }, requestItem: { request: requestVisibilityWhere(actor) } },
      select: { requestItem: { select: { requestId: true } } },
    }),
    lowStockCount(),
    listRequests(actor, { page: 1, pageSize: 5, status: ["APPROVED", "PARTIALLY_ISSUED"] }),
    listTransactions({ page: 1, pageSize: 5, type: "ISSUE" }),
    lowStockItems(),
    listTransactions({ page: 1, pageSize: 5 }),
  ]);
  const issuedToday = new Set(issueLines.flatMap((row) => row.requestItem ? [row.requestItem.requestId] : [])).size;
  return { data: { role: actor.role, readyToIssue: get("APPROVED"), partiallyIssued: get("PARTIALLY_ISSUED"), issuedToday, lowStockAlerts, pendingIssueRequests: pending.data, recentHandovers: handovers.data, lowStockItems: lowItems, recentTransactions: transactions.data } };
}
