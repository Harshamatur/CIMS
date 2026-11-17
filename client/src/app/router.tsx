import { createBrowserRouter, createMemoryRouter, type RouteObject } from "react-router";
import { RequireAuth, RequireRole } from "./guards";

export const appRoutes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => ({ Component: (await import("@/features/auth/login-page")).LoginPage }),
  },
  {
    element: <RequireAuth />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/features/dashboard/dashboard-page")).DashboardPage,
        }),
      },
      {
        path: "chemicals",
        lazy: async () => ({
          Component: (await import("@/features/chemicals/chemicals-page")).ChemicalsPage,
        }),
      },
      {
        path: "requests",
        lazy: async () => {
          const { MyRequestsPage } = await import("@/features/requests/my-requests-page");
          return { Component: () => <RequireRole roles={["EMPLOYEE"]}><MyRequestsPage /></RequireRole> };
        },
      },
      {
        path: "requests/new",
        lazy: async () => {
          const { NewRequestPage } = await import("@/features/requests/new-request-page");
          return { Component: () => <RequireRole roles={["EMPLOYEE"]}><NewRequestPage /></RequireRole> };
        },
      },
      {
        path: "requests/:id",
        lazy: async () => ({
          Component: (await import("@/features/requests/request-detail-page")).RequestDetailPage,
        }),
      },
      {
        path: "review",
        lazy: async () => {
          const { ReviewQueuePage } = await import("@/features/approvals/review-queue-page");
          return {
            Component: () => (
              <RequireRole roles={["ADMIN"]}>
                <ReviewQueuePage />
              </RequireRole>
            ),
          };
        },
      },
      {
        path: "issue",
        lazy: async () => {
          const { IssueDeskPage } = await import("@/features/stock-issues/issue-desk-page");
          return {
            Component: () => (
              <RequireRole roles={["STOREKEEPER"]}>
                <IssueDeskPage />
              </RequireRole>
            ),
          };
        },
      },
      {
        path: "inventory",
        lazy: async () => {
          const { InventoryPage } = await import("@/features/inventory/inventory-page");
          return { Component: () => <RequireRole roles={["ADMIN"]}><InventoryPage /></RequireRole> };
        },
      },
      {
        path: "stock-transactions",
        lazy: async () => {
          const { TransactionsPage } = await import("@/features/stock-transactions/transactions-page");
          return { Component: () => <RequireRole roles={["ADMIN", "STOREKEEPER"]}><TransactionsPage /></RequireRole> };
        },
      },
      {
        path: "users",
        lazy: async () => {
          const { UsersPage } = await import("@/features/users/users-page");
          return { Component: () => <RequireRole roles={["ADMIN"]}><UsersPage /></RequireRole> };
        },
      },
      {
        path: "reports",
        lazy: async () => {
          const { ReportsPage } = await import("@/features/reports/reports-page");
          return { Component: () => <RequireRole roles={["ADMIN", "STOREKEEPER"]}><ReportsPage /></RequireRole> };
        },
      },
      {
        path: "audit-logs",
        lazy: async () => {
          const { AuditPage } = await import("@/features/audit/audit-page");
          return { Component: () => <RequireRole roles={["ADMIN"]}><AuditPage /></RequireRole> };
        },
      },
      {
        path: "*",
        lazy: async () => ({ Component: (await import("./not-found")).NotFoundPage }),
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(appRoutes);
export const createTestRouter = (initialEntries: string[]) =>
  createMemoryRouter(appRoutes, { initialEntries });
