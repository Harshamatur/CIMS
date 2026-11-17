import { z } from "../../common/zod.js";
import { envelope } from "../../common/schemas.js";
import { requestSummarySchema } from "../requests/requests.schemas.js";
import { transactionSchema } from "../stock-transactions/stock.schemas.js";

const count = z.number().int().nonnegative();
const lowStockItem = z.object({ chemicalCode: z.string(), chemicalName: z.string(), packLabel: z.string(), availableQuantity: count, minimumQuantity: count });
const auditActivity = z.object({ id: z.uuid(), action: z.string(), entityType: z.string(), createdAt: z.string(), actorName: z.string().nullable() });

export const dashboardSummaryResponse = envelope(
  z.discriminatedUnion("role", [
    z.object({ role: z.literal("EMPLOYEE"), awaitingReview: count, approved: count, partiallyIssued: count, fullyIssued: count }),
    z.object({ role: z.literal("ADMIN"), totalRequests: count, awaitingDecision: count, approved: count, partiallyIssued: count, fullyIssued: count, rejected: count, lowStockAlerts: count, pendingRequests: z.array(requestSummarySchema), recentActivity: z.array(auditActivity), lowStockItems: z.array(lowStockItem), recentTransactions: z.array(transactionSchema) }),
    z.object({ role: z.literal("STOREKEEPER"), readyToIssue: count, partiallyIssued: count, issuedToday: count, lowStockAlerts: count, pendingIssueRequests: z.array(requestSummarySchema), recentHandovers: z.array(transactionSchema), lowStockItems: z.array(lowStockItem), recentTransactions: z.array(transactionSchema) }),
  ]),
);
