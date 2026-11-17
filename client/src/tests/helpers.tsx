import { render } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { vi } from "vitest";
import { Providers } from "@/app/providers";
import { createTestRouter } from "@/app/router";
import { setCsrfToken, setUnauthorizedHandler } from "@/lib/api-client";
import type { RequestDetail, RequestItem, Role, SessionUser } from "@/types/api";

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}
type RouteResult = Response | { status?: number; body?: unknown; headers?: Record<string, string> };
export type Routes = Record<string, (call: Call) => RouteResult | Promise<RouteResult>>;

export const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const apiError = (status: number, code: string, message = code) => ({
  status,
  body: { error: { code, message, requestId: "req-test-1" } },
});

/** Replaces global fetch with a route table keyed "METHOD /api/v1/path". Unknown routes answer 404 loudly. */
export function mockFetch(routes: Routes): Call[] {
  const calls: Call[] = [];
  const all: Routes = {
    "GET /api/v1/auth/csrf": () => ({ body: { data: { csrfToken: "csrf-test" } } }),
    ...routes,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      const call: Call = {
        method,
        path: url.pathname,
        query: url.searchParams,
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      const route = all[`${method} ${url.pathname}`];
      if (!route)
        return jsonResponse(404, {
          error: { code: "NOT_FOUND", message: `no mock for ${method} ${url.pathname}` },
        });
      const out = await route(call);
      if (out instanceof Response) return out;
      return jsonResponse(out.status ?? 200, out.body ?? {}, out.headers);
    }),
  );
  return calls;
}

export function resetClientState(): void {
  setCsrfToken(null);
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
}

export const makeUser = (role: Role = "EMPLOYEE", over: Partial<SessionUser> = {}): SessionUser => ({
  id: `user-${role.toLowerCase()}`,
  employeeCode: `EMP-${role.slice(0, 3)}`,
  fullName: `Test ${role.toLowerCase()}`,
  email: null,
  role,
  status: "ACTIVE",
  ...over,
});

export const meRoute = (user: SessionUser): Routes => ({
  "GET /api/v1/auth/me": () => ({ body: { data: { user, csrfToken: "csrf-test" } } }),
});

export const emptyList = { data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 } };

export function makeItem(over: Partial<RequestItem> = {}): RequestItem {
  return {
    id: "item-1",
    chemical: { id: "chem-1", chemicalCode: "DEMO-0001", name: "Demo Acid A", storageLocation: "R-01" },
    packSize: { id: "pack-1", label: "500 ml", unitType: "VOLUME" },
    requestedQuantity: 4,
    approvedQuantity: null,
    issuedQuantity: 0,
    remainingToIssue: 0,
    availability: null,
    ...over,
  };
}

export function makeRequest(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: "req-1",
    requestNumber: "REQ-2026-000001",
    status: "SUBMITTED",
    purpose: "Weekly boiler water test",
    department: "Chemistry",
    requester: { id: "user-employee", employeeCode: "EMP-EMP", fullName: "Test employee" },
    itemCount: 1,
    submittedAt: "2026-10-01T09:00:00.000Z",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    createdAt: "2026-10-01T08:55:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    items: [makeItem()],
    approvalActions: [],
    issues: [],
    ...over,
  };
}

export function renderApp(path: string) {
  const router = createTestRouter([path]);
  const utils = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, ...utils };
}
