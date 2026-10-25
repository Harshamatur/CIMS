import { ApiRouter } from "../../common/api-router.js";
import { pageMeta, pageQuerySchema, skipTake } from "../../common/pagination.js";
import { rolesFor } from "../../common/permissions.js";
import { z } from "../../common/zod.js";
import { dateRangeQuery, isoDateTime, pagedEnvelope } from "../../common/schemas.js";
import { getPrisma } from "../../db/client.js";

const auditQuery = pageQuerySchema.extend(dateRangeQuery.shape).extend({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
});

const auditItem = z
  .object({
    id: z.uuid(),
    createdAt: isoDateTime,
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    actor: z.object({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() }).nullable(),
    beforeData: z.unknown().nullable(),
    afterData: z.unknown().nullable(),
    requestId: z.string().nullable(),
    ipAddress: z.string().nullable(),
  })
  .openapi("AuditLogEntry");

export function registerAuditRoutes(api: ApiRouter): void {
  api.route({
    method: "get",
    path: "/audit-logs",
    summary: "Query the audit trail (newest first)",
    description: "Password hashes, session data and secrets are never stored in audit rows.",
    tags: ["Audit"],
    access: rolesFor("audit:read"),
    query: auditQuery,
    response: pagedEnvelope(auditItem),
    handler: async ({ query }) => {
      const where = {
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      };
      const db = getPrisma();
      const [rows, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake(query),
          include: { actor: { select: { id: true, employeeCode: true, fullName: true } } },
        }),
        db.auditLog.count({ where }),
      ]);
      return {
        data: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actor: r.actor,
          beforeData: r.beforeData,
          afterData: r.afterData,
          requestId: r.requestId,
          ipAddress: r.ipAddress,
        })),
        meta: pageMeta(query, total),
      };
    },
  });
}
