import { isIP } from "node:net";
import { sanitizeForAudit } from "../../common/audit-sanitize.js";
import type { Tx, PrismaClient, InputJson } from "../../db/client.js";

export interface ServiceContext {
  actorId: string | null;
  requestId: string;
  ip: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const cleanIp = (ip: string | null): string | null => {
  if (!ip) return null;
  const stripped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return isIP(stripped) ? stripped : null;
};

/** Append-only audit write. Pass the transaction client so the audit row commits/rolls back with the business change. */
export async function recordAudit(
  db: Tx | PrismaClient,
  ctx: ServiceContext,
  entry: AuditEntry,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: ctx.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeData: entry.before === undefined ? undefined : (sanitizeForAudit(entry.before) as InputJson),
      afterData: entry.after === undefined ? undefined : (sanitizeForAudit(entry.after) as InputJson),
      requestId: ctx.requestId,
      ipAddress: cleanIp(ctx.ip),
    },
  });
}
