import { ApiRouter } from "../../common/api-router.js";
import { dashboardSummaryResponse } from "./dashboard.schemas.js";
import { getDashboardSummary } from "./dashboard.service.js";

export function registerDashboardRoutes(api: ApiRouter): void {
  api.route({
    method: "get",
    path: "/dashboard/summary",
    summary: "Role-specific operational dashboard summary",
    description: "Returns metrics scoped to the authenticated user's role and request visibility.",
    tags: ["Dashboard"],
    access: "authenticated",
    response: dashboardSummaryResponse,
    handler: async ({ user }) => getDashboardSummary(user),
  });
}
