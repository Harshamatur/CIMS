import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  apiError,
  emptyList,
  makeItem,
  makeRequest,
  makeUser,
  meRoute,
  mockFetch,
  renderApp,
  resetClientState,
  type Call,
  type Routes,
} from "./helpers";

beforeEach(() => resetClientState());
afterEach(() => resetClientState());

const listRoute: Routes = {
  "GET /api/v1/auth/capabilities": () => ({ body: { data: { allowAdminIssue: false } } }),
  "GET /api/v1/dashboard/summary": () => ({
    body: { data: { role: "EMPLOYEE", awaitingReview: 0, approved: 0, partiallyIssued: 0, fullyIssued: 0 } },
  }),
  "GET /api/v1/requests": () => ({ body: emptyList }),
  "GET /api/v1/requests/counts": () => ({
    body: {
      data: {
        DRAFT: 0,
        SUBMITTED: 0,
        APPROVED: 0,
        REJECTED: 0,
        PARTIALLY_ISSUED: 0,
        ISSUED: 0,
        CANCELLED: 0,
      },
    },
  }),
};
const count = (calls: Call[], key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length;

describe("login", () => {
  it("sends unauthenticated visitors to the sign-in page", async () => {
    mockFetch({ "GET /api/v1/auth/me": () => apiError(401, "UNAUTHENTICATED") });
    renderApp("/requests");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates empty fields before calling the server", async () => {
    const calls = mockFetch({ "GET /api/v1/auth/me": () => apiError(401, "UNAUTHENTICATED") });
    renderApp("/login");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your employee code or work email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(count(calls, "POST /api/v1/auth/login")).toBe(0);
  });

  it("shows a safe message for wrong credentials and stays on the page", async () => {
    mockFetch({
      "GET /api/v1/auth/me": () => apiError(401, "UNAUTHENTICATED"),
      "POST /api/v1/auth/login": () => apiError(401, "INVALID_CREDENTIALS"),
    });
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/employee code/i), "EMP-1");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/incorrect/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in with the CSRF token and lands on the dashboard", async () => {
    const employee = makeUser("EMPLOYEE");
    const calls = mockFetch({
      "GET /api/v1/auth/me": () => apiError(401, "UNAUTHENTICATED"),
      "POST /api/v1/auth/login": () => ({
        body: { data: { user: employee, csrfToken: "csrf-after-login" } },
      }),
      ...listRoute,
    });
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/employee code/i), "EMP-EMP");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /welcome, test/i })).toBeInTheDocument();
    const login = calls.find((c) => c.path === "/api/v1/auth/login");
    expect(login?.headers.get("x-csrf-token")).toBe("csrf-test");
    expect(login?.body).toEqual({ identifier: "EMP-EMP", password: "a-long-enough-password" });
  });

  it.each(["EMPLOYEE", "ADMIN", "STOREKEEPER"] as const)(
    "destroys the server session and signs out a %s",
    async (role) => {
      const calls = mockFetch({
        ...meRoute(makeUser(role)),
        ...listRoute,
        "POST /api/v1/auth/logout": () => ({ body: { data: { ok: true } } }),
      });
      renderApp("/requests");
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Sign out" }));
      expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(count(calls, "POST /api/v1/auth/logout")).toBe(1);
    },
  );

  it("keeps the user signed in and reports an error when logout cannot reach the server", async () => {
    const calls = mockFetch({
      ...meRoute(makeUser("STOREKEEPER")),
      ...listRoute,
      "POST /api/v1/auth/logout": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/requests");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign out failed.*cannot reach the server/i);
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(count(calls, "POST /api/v1/auth/logout")).toBe(1);
  });
});

describe("role-based access", () => {
  it("submits threshold, receipt and adjustment actions from inventory management", async () => {
    const chemicalId = "11111111-1111-4111-8111-111111111111";
    const packSizeId = "22222222-2222-4222-8222-222222222222";
    const balance = {
      id: "33333333-3333-4333-8333-333333333333",
      chemicalId,
      chemicalCode: "DEMO-1",
      chemicalName: "Demo chemical",
      storageLocation: "R-1",
      chemicalActive: true,
      packSizeId,
      packLabel: "500 g",
      unitType: "MASS",
      baseUnit: "g",
      baseQuantity: "500",
      packActive: true,
      onHandQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      minimumQuantity: 5,
      lowStock: true,
      version: 1,
      updatedAt: "2026-11-17T00:00:00.000Z",
    };
    const calls = mockFetch({
      ...meRoute(makeUser("ADMIN")),
      ...listRoute,
      "GET /api/v1/inventory": () => ({
        body: { data: [balance], meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 } },
      }),
      "PATCH /api/v1/inventory/22222222-2222-4222-8222-222222222222/threshold": () => ({
        body: { data: balance },
      }),
      "POST /api/v1/stock-transactions/receipts": () => ({ status: 201, body: { data: {} } }),
      "POST /api/v1/stock-transactions/adjustments": () => ({ status: 201, body: { data: {} } }),
    });
    renderApp("/inventory");
    const user = userEvent.setup();
    await screen.findByText("Demo chemical");
    await user.clear(screen.getByLabelText("Low-stock threshold"));
    await user.type(screen.getByLabelText("Low-stock threshold"), "8");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("1 inventory change saved.");
    expect(calls.find((call) => call.method === "PATCH" && call.path.includes("/threshold"))?.body).toEqual({
      minimumQuantity: 8,
    });

    await user.type(screen.getByRole("spinbutton", { name: "Receipt quantity in packs" }), "4");
    await user.type(screen.getByRole("textbox", { name: "Receipt reference" }), "GRN-123");
    await user.click(screen.getByRole("button", { name: "Add receipt" }));
    expect(await screen.findByText(/Added receipt to pending changes/)).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith("/receipts"))).toBe(false);

    await user.selectOptions(screen.getByRole("combobox", { name: "Adjustment direction" }), "OUT");
    await user.type(screen.getByRole("spinbutton", { name: "Adjustment quantity in packs" }), "1");
    await user.type(screen.getByRole("textbox", { name: "Adjustment reason" }), "Physical count correction");
    await user.click(screen.getByRole("button", { name: "Add adjustment" }));
    expect(await screen.findByText(/Added adjustment to pending changes/)).toBeInTheDocument();
    expect(screen.getByText(/click save changes above the table to update stock/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("2 inventory changes saved.");
    expect(calls.find((call) => call.path.endsWith("/receipts"))?.body).toMatchObject({
      chemicalId,
      packSizeId,
      quantity: 4,
      reason: "GRN-123",
    });
    expect(calls.find((call) => call.path.endsWith("/adjustments"))?.body).toMatchObject({
      chemicalId,
      packSizeId,
      quantity: 1,
      direction: "OUT",
    });
  });

  it("shows an employee the empty first-use dashboard without admin areas", async () => {
    const calls = mockFetch({ ...meRoute(makeUser("EMPLOYEE")), ...listRoute });
    renderApp("/");
    expect(await screen.findByText(/no requests yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Issue desk" })).not.toBeInTheDocument();
    expect(count(calls, "GET /api/v1/dashboard/summary")).toBe(1);
    expect(
      calls.filter((c) => c.path === "/api/v1/requests" && c.query.get("pageSize") === "1"),
    ).toHaveLength(0);
  });

  it("restricts the review queue to administrators and makes no queue request for others", async () => {
    const calls = mockFetch({ ...meRoute(makeUser("EMPLOYEE")), ...listRoute });
    renderApp("/review");
    expect(await screen.findByRole("heading", { name: "Access restricted" })).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/requests")).toBe(false);
  });

  it("restricts the issue desk to storekeepers", async () => {
    mockFetch({ ...meRoute(makeUser("ADMIN")), ...listRoute });
    renderApp("/issue");
    expect(await screen.findByRole("heading", { name: "Access restricted" })).toBeInTheDocument();
  });

  it("allows an administrator to use the issue desk only when the server capability permits it", async () => {
    mockFetch({
      ...meRoute(makeUser("ADMIN")),
      ...listRoute,
      "GET /api/v1/auth/capabilities": () => ({ body: { data: { allowAdminIssue: true } } }),
    });
    renderApp("/issue");
    expect(await screen.findByRole("heading", { name: "Issue desk" })).toBeInTheDocument();
  });

  it("opens the mobile navigation drawer from the menu button", async () => {
    mockFetch({ ...meRoute(makeUser("STOREKEEPER")), ...listRoute });
    renderApp("/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByRole("link", { name: "Issue desk" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("link", { name: "New request" })).not.toBeInTheDocument();
  });

  it("shows the administrator workspace, operational metrics and implemented tools", async () => {
    const user = makeUser("ADMIN");
    mockFetch({
      ...meRoute(user),
      ...listRoute,
      "GET /api/v1/dashboard/summary": () => ({
        body: {
          data: {
            role: "ADMIN",
            totalRequests: 18,
            awaitingDecision: 3,
            approved: 4,
            partiallyIssued: 2,
            fullyIssued: 5,
            rejected: 4,
            lowStockAlerts: 1,
            pendingRequests: [],
            recentActivity: [],
            lowStockItems: [],
            recentTransactions: [],
          },
        },
      }),
    });
    renderApp("/");
    expect(await screen.findByText("Total Requests")).toBeInTheDocument();
    expect(screen.getByText("Low Stock Alerts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventory management" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "User management" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My requests" })).not.toBeInTheDocument();
  });

  it("shows the storekeeper issue workspace without approval or requester actions", async () => {
    const user = makeUser("STOREKEEPER");
    mockFetch({
      ...meRoute(user),
      ...listRoute,
      "GET /api/v1/dashboard/summary": () => ({
        body: {
          data: {
            role: "STOREKEEPER",
            readyToIssue: 2,
            partiallyIssued: 1,
            issuedToday: 3,
            lowStockAlerts: 1,
            pendingIssueRequests: [],
            recentHandovers: [],
            lowStockItems: [],
            recentTransactions: [],
          },
        },
      }),
    });
    renderApp("/");
    expect(await screen.findByText("Ready to Issue")).toBeInTheDocument();
    expect(screen.getByText("Issued Today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Issue desk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stock transactions" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Review queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New request" })).not.toBeInTheDocument();
  });

  it("blocks employees from direct administrative management routes", async () => {
    mockFetch({ ...meRoute(makeUser("EMPLOYEE")), ...listRoute });
    renderApp("/users");
    expect(await screen.findByRole("heading", { name: "Access restricted" })).toBeInTheDocument();
  });

  it("returns to sign-in with an explanation when the session expires mid-use", async () => {
    // Signed in (the session probe succeeds), but the data call reports the session has ended.
    mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/requests/req-1": () => apiError(401, "UNAUTHENTICATED"),
    });
    renderApp("/requests/req-1");
    expect(await screen.findByText("Session ended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("request detail by role and status", () => {
  const detailRoute = (r = makeRequest()): Routes => ({
    "GET /api/v1/requests/req-1": () => ({ body: { data: r } }),
  });

  it("lets an administrator review someone else's submitted request", async () => {
    mockFetch({ ...meRoute(makeUser("ADMIN")), ...detailRoute() });
    renderApp("/requests/req-1");
    expect(await screen.findByRole("heading", { name: "Review this request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("does not let an administrator review their own request", async () => {
    const admin = makeUser("ADMIN");
    mockFetch({
      ...meRoute(admin),
      ...detailRoute(
        makeRequest({
          requester: { id: admin.id, employeeCode: admin.employeeCode, fullName: admin.fullName },
        }),
      ),
    });
    renderApp("/requests/req-1");
    expect(await screen.findByText("Another administrator must review this request")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("gives the owner cancel but never approve or issue", async () => {
    mockFetch({ ...meRoute(makeUser("EMPLOYEE")), ...detailRoute() });
    renderApp("/requests/req-1");
    expect(await screen.findByRole("button", { name: /cancel request/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record issue/i })).not.toBeInTheDocument();
  });

  it("explains the difference between approved and issued", async () => {
    const approved = makeRequest({
      status: "APPROVED",
      items: [makeItem({ approvedQuantity: 4, remainingToIssue: 4 })],
    });
    mockFetch({ ...meRoute(makeUser("EMPLOYEE")), ...detailRoute(approved) });
    renderApp("/requests/req-1");
    expect(
      await screen.findByText(/authorised, but the chemicals have not been handed over yet/i),
    ).toBeInTheDocument();
  });

  it("shows the rejection reason prominently", async () => {
    mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      ...detailRoute(makeRequest({ status: "REJECTED", rejectionReason: "Not required this month" })),
    });
    renderApp("/requests/req-1");
    expect(await screen.findByText("Not required this month")).toBeInTheDocument();
  });

  it("says so when the request does not exist or is not yours", async () => {
    mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/requests/req-1": () => apiError(404, "NOT_FOUND"),
    });
    renderApp("/requests/req-1");
    expect(await screen.findByText("Request not found")).toBeInTheDocument();
  });

  it("shows a storekeeper nothing to act on until the request is approved", async () => {
    mockFetch({ ...meRoute(makeUser("STOREKEEPER")), ...detailRoute() });
    renderApp("/requests/req-1");
    await screen.findByText("Weekly boiler water test");
    expect(screen.queryByRole("heading", { name: /record issue/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});

describe("approve and reject", () => {
  it("requires a reason of at least 10 characters before rejecting, then posts it", async () => {
    let detail = makeRequest();
    const calls = mockFetch({
      ...meRoute(makeUser("ADMIN")),
      "GET /api/v1/requests/req-1": () => ({ body: { data: detail } }),
      "POST /api/v1/requests/req-1/reject": (c) => {
        detail = makeRequest({ status: "REJECTED", rejectionReason: (c.body as { reason: string }).reason });
        return { body: { data: detail } };
      },
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /reject/i }));
    const confirm = await screen.findByRole("button", { name: "Confirm rejection" });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/reason/i), "too short");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/reason/i), " and now it is long enough");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(screen.getAllByText("Request rejected.").length).toBeGreaterThan(0));
    expect(calls.find((c) => c.path.endsWith("/reject"))?.body).toEqual({
      reason: "too short and now it is long enough",
    });
    expect(await screen.findByText(/long enough/)).toBeInTheDocument();
  });

  it("refreshes and explains when another reviewer decided first", async () => {
    const calls = mockFetch({
      ...meRoute(makeUser("ADMIN")),
      "GET /api/v1/requests/req-1": () => ({ body: { data: makeRequest() } }),
      "POST /api/v1/requests/req-1/approve": () => apiError(409, "ALREADY_DECIDED"),
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /approve/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText(/already decided/i)).toBeInTheDocument();
    await waitFor(() => expect(count(calls, "GET /api/v1/requests/req-1")).toBeGreaterThanOrEqual(2));
  });

  it("blocks over-approval in the partial-approval form without calling the server", async () => {
    const calls = mockFetch({
      ...meRoute(makeUser("ADMIN")),
      "GET /api/v1/requests/req-1": () => ({ body: { data: makeRequest() } }),
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /approve/i }));
    await user.click(await screen.findByLabelText(/approve different quantities/i));
    const qty = screen.getByLabelText(/approved quantity for demo acid a/i);
    await user.clear(qty);
    await user.type(qty, "9");
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByText(/cannot approve more than the 4 requested/i)).toBeInTheDocument();
    expect(count(calls, "POST /api/v1/requests/req-1/approve")).toBe(0);
  });
});

describe("issue desk: recording the physical issue", () => {
  const approved = () =>
    makeRequest({
      status: "APPROVED",
      items: [
        makeItem({
          approvedQuantity: 4,
          remainingToIssue: 4,
          availability: { available: 10, lowStock: false },
        }),
      ],
      decidedAt: "2026-10-01T10:00:00.000Z",
    });
  const base = (): Routes => ({
    ...meRoute(makeUser("STOREKEEPER")),
    "GET /api/v1/requests/req-1": () => ({ body: { data: approved() } }),
  });

  it("confirms, then posts the quantities with an Idempotency-Key", async () => {
    const calls = mockFetch({
      ...base(),
      "POST /api/v1/requests/req-1/issue": () => ({ body: { data: makeRequest({ status: "ISSUED" }) } }),
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    expect(await screen.findByText(/10 available/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /record issue/i }));
    expect(await screen.findByText(/stock is deducted immediately/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm issue" }));
    await waitFor(() => expect(screen.getAllByText(/issue recorded/i).length).toBeGreaterThan(0));
    const post = calls.find((c) => c.path.endsWith("/issue"));
    expect(post?.body).toEqual({ lines: [{ requestItemId: "item-1", quantity: 4 }] });
    expect(post?.headers.get("idempotency-key")).toMatch(/.{8,}/);
    expect(count(calls, "GET /api/v1/requests/req-1")).toBe(1);
    expect(calls.some((c) => c.path === "/api/v1/chemicals/chem-1")).toBe(false);
  });

  it("re-uses the same Idempotency-Key when retrying after a dropped connection", async () => {
    let attempts = 0;
    const calls = mockFetch({
      ...base(),
      "POST /api/v1/requests/req-1/issue": () => {
        if (++attempts === 1) throw new TypeError("Failed to fetch");
        return { body: { data: makeRequest({ status: "ISSUED" }) } };
      },
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /record issue/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm issue" }));
    expect(await screen.findByText(/safe to press confirm again/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm issue" }));
    await waitFor(() => expect(attempts).toBe(2));
    const keys = calls.filter((c) => c.path.endsWith("/issue")).map((c) => c.headers.get("idempotency-key"));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("uses a NEW key when the quantities change", async () => {
    const calls = mockFetch({
      ...base(),
      "POST /api/v1/requests/req-1/issue": () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /record issue/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm issue" }));
    await screen.findByText(/safe to press confirm again/i);
    await user.click(screen.getByRole("button", { name: "Back" }));
    const qty = screen.getByLabelText(/packs to issue/i);
    await user.clear(qty);
    await user.type(qty, "2");
    await user.click(screen.getByRole("button", { name: /record issue/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm issue" }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/issue"))).toHaveLength(2));
    const [first, second] = calls.filter((c) => c.path.endsWith("/issue"));
    expect(first?.headers.get("idempotency-key")).not.toBe(second?.headers.get("idempotency-key"));
    expect(second?.body).toEqual({ lines: [{ requestItemId: "item-1", quantity: 2 }] });
  });

  it("explains insufficient stock and refreshes instead of pretending it worked", async () => {
    const calls = mockFetch({
      ...base(),
      "POST /api/v1/requests/req-1/issue": () => apiError(409, "INSUFFICIENT_STOCK"),
    });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /record issue/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm issue" }));
    expect(await screen.findByText(/not enough available stock/i)).toBeInTheDocument();
    await waitFor(() => expect(count(calls, "GET /api/v1/requests/req-1")).toBeGreaterThanOrEqual(2));
  });

  it("refuses to submit quantities above what remains approved", async () => {
    const calls = mockFetch({ ...base() });
    renderApp("/requests/req-1");
    const user = userEvent.setup();
    const qty = await screen.findByLabelText(/packs to issue/i);
    await user.clear(qty);
    await user.type(qty, "5");
    await user.click(screen.getByRole("button", { name: /record issue/i }));
    expect(await screen.findByText(/only 4 approved pack/i)).toBeInTheDocument();
    expect(count(calls, "POST /api/v1/requests/req-1/issue")).toBe(0);
  });
});

describe("new request", () => {
  const chemicals = {
    data: [
      {
        id: "chem-1",
        chemicalCode: "DEMO-0001",
        name: "Demo Acid A",
        description: null,
        category: "Acid",
        hazardNotes: null,
        storageLocation: "R-01",
        minimumStockAlert: 0,
        isActive: true,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        packSizes: [
          {
            id: "pack-1",
            label: "500 ml",
            unitType: "VOLUME",
            baseUnit: "ml",
            baseQuantity: "500",
            isActive: true,
            balance: { available: 3, lowStock: false },
          },
        ],
      },
    ],
    meta: { page: 1, pageSize: 6, total: 1, totalPages: 1 },
  };
  const submitted = makeRequest({ id: "req-new", status: "SUBMITTED" });

  async function fillAndReachReview(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /add 1 × 500 ml of demo acid a/i }));
    expect(await screen.findByText("Your request (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(await screen.findByLabelText("Purpose"), "Weekly boiler water test");
    await user.click(screen.getByRole("button", { name: /review/i }));
    await screen.findByRole("heading", { name: /3\. review and submit/i });
  }

  it("builds a request, creates the draft, submits it and shows the server-issued number", async () => {
    const calls = mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/chemicals": () => ({ body: chemicals }),
      "POST /api/v1/requests": () => ({
        status: 201,
        body: { data: makeRequest({ id: "req-new", status: "DRAFT", requestNumber: null }) },
      }),
      "POST /api/v1/requests/req-new/submit": () => ({ body: { data: submitted } }),
      "GET /api/v1/requests/req-new": () => ({ body: { data: submitted } }),
    });
    renderApp("/requests/new");
    const user = userEvent.setup();
    await fillAndReachReview(user);
    await user.click(screen.getByRole("button", { name: /submit request/i }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(screen.getAllByText(/REQ-2026-000001/).length).toBeGreaterThan(0);
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/v1/requests")?.body).toEqual({
      purpose: "Weekly boiler water test",
      items: [{ chemicalId: "chem-1", packSizeId: "pack-1", quantity: 1 }],
    });
  });

  it("does not create a second draft when a failed submit is retried", async () => {
    let submits = 0;
    const calls = mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/chemicals": () => ({ body: chemicals }),
      "POST /api/v1/requests": () => ({
        status: 201,
        body: { data: makeRequest({ id: "req-new", status: "DRAFT", requestNumber: null }) },
      }),
      "POST /api/v1/requests/req-new/submit": () =>
        ++submits === 1 ? apiError(500, "INTERNAL_ERROR") : { body: { data: submitted } },
      "GET /api/v1/requests/req-new": () => ({ body: { data: submitted } }),
    });
    renderApp("/requests/new");
    const user = userEvent.setup();
    await fillAndReachReview(user);
    await user.click(screen.getByRole("button", { name: /submit request/i }));
    expect(await screen.findByText(/saved as a draft/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /submit request/i }));
    expect(await screen.findByText("Request submitted")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST" && c.path === "/api/v1/requests")).toHaveLength(1);
  });

  it("validates the purpose and warns (without blocking) when asking for more than is in stock", async () => {
    const calls = mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/chemicals": () => ({ body: chemicals }),
    });
    renderApp("/requests/new");
    const user = userEvent.setup();
    const qty = await screen.findByLabelText(/number of 500 ml packs for demo acid a/i);
    await user.clear(qty);
    await user.type(qty, "7");
    await user.click(screen.getByRole("button", { name: /add 7 × 500 ml/i }));
    expect(await screen.findByText(/more than the 3 currently available/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await user.type(await screen.findByLabelText("Purpose"), "abc");
    await user.click(screen.getByRole("button", { name: /review/i }));
    expect(await screen.findByText(/at least 5 characters/i)).toBeInTheDocument();
    expect(count(calls, "POST /api/v1/requests")).toBe(0);
  });

  it("rejects invalid quantities in the picker", async () => {
    mockFetch({ ...meRoute(makeUser("EMPLOYEE")), "GET /api/v1/chemicals": () => ({ body: chemicals }) });
    renderApp("/requests/new");
    const user = userEvent.setup();
    const qty = await screen.findByLabelText(/number of 500 ml packs/i);
    for (const bad of ["0", "1.5", "abc", ""]) {
      await user.clear(qty);
      if (bad) await user.type(qty, bad);
      expect(screen.getByRole("button", { name: /add .* × 500 ml of demo acid a/i })).toBeDisabled();
    }
  });
});

describe("chemicals and status badges", () => {
  it("submits chemical creation, detail edits and pack size forms", async () => {
    const chemical = {
      id: "chem-1",
      chemicalCode: "DEMO-0001",
      name: "Demo Acid A",
      description: null,
      category: "Acid",
      hazardNotes: null,
      storageLocation: "R-01",
      minimumStockAlert: 0,
      isActive: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      packSizes: [],
    };
    const calls = mockFetch({
      ...meRoute(makeUser("ADMIN")),
      "GET /api/v1/chemicals": () => ({ body: { data: [chemical], meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } } }),
      "POST /api/v1/chemicals": () => ({ body: { data: chemical } }),
      "PATCH /api/v1/chemicals/chem-1": () => ({ body: { data: chemical } }),
      "POST /api/v1/chemicals/chem-1/pack-sizes": () => ({ body: { data: {} } }),
    });
    renderApp("/chemicals");
    const user = userEvent.setup();
    await screen.findByText("Demo Acid A");

    await user.type(screen.getByLabelText("Chemical code"), "DEMO-NEW");
    await user.type(screen.getByLabelText("Chemical name"), "New chemical");
    await user.type(screen.getByLabelText("Pack label"), "250 ml");
    await user.type(screen.getByLabelText("Base quantity"), "250");
    await user.click(screen.getByRole("button", { name: "Create chemical" }));
    await screen.findByText("Chemical and pack size created.");

    await user.click(screen.getByText("Edit chemical details"));
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await screen.findByText("Chemical details saved.");

    await user.click(screen.getByText("Add pack size", { selector: "summary" }));
    await user.type(screen.getByLabelText("New pack label for Demo Acid A"), "1 L");
    await user.type(screen.getByLabelText("New pack base quantity for Demo Acid A"), "1000");
    await user.click(screen.getByRole("button", { name: "Add pack size" }));
    await screen.findByText("Pack size added.");

    expect(calls.find((call) => call.method === "POST" && call.path === "/api/v1/chemicals")?.body).toMatchObject({
      chemicalCode: "DEMO-NEW",
      name: "New chemical",
      packSizes: [{ label: "250 ml", baseQuantity: 250 }],
    });
    expect(calls.some((call) => call.method === "PATCH" && call.path === "/api/v1/chemicals/chem-1")).toBe(true);
    expect(calls.find((call) => call.method === "POST" && call.path.endsWith("/pack-sizes"))?.body).toEqual({
      label: "1 L",
      unitType: "MASS",
      baseQuantity: 1000,
    });
  });

  it("shows availability to employees but not on-hand detail", async () => {
    mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/chemicals": () => ({
        body: {
          data: [
            {
              id: "chem-1",
              chemicalCode: "DEMO-0001",
              name: "Demo Acid A",
              description: null,
              category: null,
              hazardNotes: null,
              storageLocation: "R-01",
              minimumStockAlert: 0,
              isActive: true,
              createdAt: "2026-10-01T00:00:00.000Z",
              updatedAt: "2026-10-01T00:00:00.000Z",
              packSizes: [
                {
                  id: "p1",
                  label: "500 ml",
                  unitType: "VOLUME",
                  baseUnit: "ml",
                  baseQuantity: "500",
                  isActive: true,
                  balance: { available: 0, lowStock: false },
                },
                {
                  id: "p2",
                  label: "100 g",
                  unitType: "MASS",
                  baseUnit: "g",
                  baseQuantity: "100",
                  isActive: true,
                  balance: { available: 2, lowStock: true },
                },
              ],
            },
          ],
          meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        },
      }),
    });
    renderApp("/chemicals");
    expect(await screen.findByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByText(/low · 2 available/i)).toBeInTheDocument();
    expect(screen.queryByText(/on hand/i)).not.toBeInTheDocument();
  });

  it("renders status as text, not colour alone", async () => {
    mockFetch({
      ...meRoute(makeUser("EMPLOYEE")),
      "GET /api/v1/requests": () => ({
        body: {
          data: [{ ...makeRequest(), items: undefined }],
          meta: { page: 1, pageSize: 15, total: 1, totalPages: 1 },
        },
      }),
    });
    renderApp("/requests");
    expect((await screen.findAllByText("Awaiting review")).length).toBeGreaterThan(0);
  });
});
