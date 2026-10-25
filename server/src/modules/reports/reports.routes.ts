import { ApiRouter } from "../../common/api-router.js";
import { CSV_EXPORT_MAX_ROWS, pageMeta, pageQuerySchema } from "../../common/pagination.js";
import { rolesFor } from "../../common/permissions.js";
import { toCsv } from "../../common/csv.js";
import { z } from "../../common/zod.js";
import { csvFormatQuery, dateRangeQuery, pagedEnvelope, requestStatusSchema } from "../../common/schemas.js";
import { getPrisma } from "../../db/client.js";
import { balanceSchema, balanceQuery } from "../inventory/inventory.routes.js";
import { queryBalances, type BalanceDto } from "../inventory/inventory.service.js";
import { listRequests } from "../requests/requests.service.js";
import { requestSummarySchema } from "../requests/requests.schemas.js";
import { REQUEST_STATUSES } from "../../common/state-machine.js";
import { listTransactionsQuery, transactionSchema } from "../stock-transactions/stock.schemas.js";
import { listTransactions } from "../stock-transactions/stock.service.js";

const balanceReportQuery = balanceQuery.extend(csvFormatQuery.shape);

const balanceCsv = (rows: BalanceDto[]) =>
  toCsv(
    [
      "Chemical code",
      "Chemical",
      "Storage location",
      "Pack size",
      "Unit type",
      "On hand (packs)",
      "Reserved (packs)",
      "Available (packs)",
      "Minimum (packs)",
      "Low stock",
    ],
    rows.map((r) => [
      r.chemicalCode,
      r.chemicalName,
      r.storageLocation,
      r.packLabel,
      r.unitType,
      r.onHandQuantity,
      r.reservedQuantity,
      r.availableQuantity,
      r.minimumQuantity,
      r.lowStock ? "YES" : "NO",
    ]),
  );

export function registerReportRoutes(api: ApiRouter): void {
  const stockRoles = rolesFor("reports:inventory");

  const balanceReport = (path: string, summary: string, lowOnly: boolean, filename: string) =>
    api.route({
      method: "get",
      path,
      summary,
      description:
        "Add `format=csv` to download (capped at 10,000 rows; spreadsheet formula injection is neutralised).",
      tags: ["Reports"],
      access: stockRoles,
      query: balanceReportQuery,
      response: pagedEnvelope(balanceSchema),
      handler: async ({ query, res }) => {
        const filter = { q: query.q, chemicalId: query.chemicalId, lowOnly: lowOnly || query.lowOnly };
        if (query.format === "csv") {
          const { rows } = await queryBalances(filter, { limit: CSV_EXPORT_MAX_ROWS, offset: 0 });
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Cache-Control", "no-store");
          res.status(200).send(balanceCsv(rows));
          return undefined;
        }
        const { rows, total } = await queryBalances(filter, {
          limit: query.pageSize,
          offset: (query.page - 1) * query.pageSize,
        });
        return { data: rows, meta: pageMeta(query, total) };
      },
    });
  balanceReport("/reports/inventory", "Current inventory by chemical and pack size", false, "inventory.csv");
  balanceReport(
    "/reports/low-stock",
    "Low-stock inventory (available <= minimum, minimum > 0)",
    true,
    "low-stock.csv",
  );

  const requestReportQuery = pageQuerySchema.extend(dateRangeQuery.shape).extend({
    status: requestStatusSchema.optional(),
    requestedBy: z.uuid().optional(),
    format: csvFormatQuery.shape.format,
  });
  api.route({
    method: "get",
    path: "/reports/requests",
    summary: "Requests by status (counts) with a filtered, paginated list",
    description:
      "`statusCounts` covers the same date range / requester filter and all statuses. Drafts of other users are never included.",
    tags: ["Reports"],
    access: rolesFor("reports:requests"),
    query: requestReportQuery,
    response: z.object({
      data: z.array(requestSummarySchema),
      meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() }),
      statusCounts: z.record(z.string(), z.number().int()),
    }),
    handler: async ({ query, user, res }) => {
      const db = getPrisma();
      const range = {
        ...(query.requestedBy ? { requestedBy: query.requestedBy } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
        status: { not: "DRAFT" as const },
      };
      const grouped = await db.chemicalRequest.groupBy({
        by: ["status"],
        where: range,
        _count: { _all: true },
      });
      const statusCounts = Object.fromEntries(
        REQUEST_STATUSES.filter((s) => s !== "DRAFT").map((s) => [s, 0]),
      ) as Record<string, number>;
      for (const g of grouped) statusCounts[g.status] = g._count._all;

      const list = await listRequests(user, {
        ...query,
        status: query.status ? [query.status] : undefined,
        page: query.format === "csv" ? 1 : query.page,
        pageSize: query.format === "csv" ? CSV_EXPORT_MAX_ROWS : query.pageSize,
      });
      if (query.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="requests.csv"');
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(
          toCsv(
            [
              "Request number",
              "Status",
              "Requester",
              "Employee code",
              "Department",
              "Purpose",
              "Items",
              "Submitted at",
              "Decided at",
            ],
            list.data.map((r) => [
              r.requestNumber,
              r.status,
              r.requester.fullName,
              r.requester.employeeCode,
              r.department,
              r.purpose,
              r.itemCount,
              r.submittedAt,
              r.decidedAt,
            ]),
          ),
        );
        return undefined;
      }
      return { ...list, statusCounts };
    },
  });

  api.route({
    method: "get",
    path: "/reports/stock-transactions",
    summary: "Stock transactions filtered by date, chemical, actor and type",
    tags: ["Reports"],
    access: rolesFor("stock:read"),
    query: listTransactionsQuery.extend(csvFormatQuery.shape),
    response: pagedEnvelope(transactionSchema),
    handler: async ({ query, res }) => {
      if (query.format === "csv") {
        const rows: Awaited<ReturnType<typeof listTransactions>>["data"] = [];
        for (let page = 1; rows.length < CSV_EXPORT_MAX_ROWS; page++) {
          const chunk = await listTransactions({ ...query, page, pageSize: 100 });
          rows.push(...chunk.data);
          if (page >= chunk.meta.totalPages) break;
        }
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="stock-transactions.csv"');
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(
          toCsv(
            [
              "Date (UTC)",
              "Type",
              "Direction",
              "Quantity (packs)",
              "Chemical code",
              "Chemical",
              "Pack size",
              "Performed by",
              "Reason",
            ],
            rows
              .slice(0, CSV_EXPORT_MAX_ROWS)
              .map((t) => [
                t.createdAt,
                t.transactionType,
                t.direction,
                t.quantity,
                t.chemical.chemicalCode,
                t.chemical.name,
                t.packSize.label,
                t.performedBy.fullName,
                t.reason,
              ]),
          ),
        );
        return undefined;
      }
      return listTransactions(query);
    },
  });
}
