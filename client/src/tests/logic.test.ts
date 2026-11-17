import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, buildUrl, setCsrfToken, setUnauthorizedHandler } from "@/lib/api-client";
import { describeError, isStaleStateError } from "@/lib/errors";
import { IssueKeyStore, issueSignature } from "@/lib/idempotency";
import { buildApproveBody } from "@/features/approvals/review-panel";
import { buildIssueBody } from "@/features/stock-issues/issue-panel";
import { cartProblems, cartReducer, cartToItems, type CartLine } from "@/features/requests/cart";
import { buildTimeline } from "@/features/requests/timeline";
import { navFor } from "@/components/layout/nav";
import { apiError, makeItem, makeRequest, mockFetch, resetClientState } from "./helpers";

beforeEach(() => resetClientState());
afterEach(() => resetClientState());

describe("api client", () => {
  it("skips empty query values", () => {
    expect(buildUrl("/requests", { status: "SUBMITTED", q: "", page: 2, x: undefined, y: null })).toBe(
      "/api/v1/requests?status=SUBMITTED&page=2",
    );
  });

  it("fetches a CSRF token before the first state-changing request and attaches it", async () => {
    const calls = mockFetch({ "POST /api/v1/requests/1/submit": () => ({ body: { data: {} } }) });
    await api("/requests/1/submit", { method: "POST", body: {} });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/v1/auth/csrf",
      "POST /api/v1/requests/1/submit",
    ]);
    expect(calls[1]?.headers.get("x-csrf-token")).toBe("csrf-test");
  });

  it("does not send a CSRF header on GET and always includes credentials", async () => {
    const calls = mockFetch({ "GET /api/v1/chemicals": () => ({ body: { data: [] } }) });
    await api("/chemicals");
    expect(calls[0]?.headers.get("x-csrf-token")).toBeNull();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("turns the error envelope into an ApiError with code, field errors and request id", async () => {
    mockFetch({
      "POST /api/v1/requests": () => ({
        status: 400,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed.",
            fieldErrors: [{ path: "body.purpose", message: "too short" }],
            requestId: "abc-123",
          },
        },
      }),
    });
    setCsrfToken("t");
    await expect(api("/requests", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      requestId: "abc-123",
      fieldErrors: [{ path: "body.purpose", message: "too short" }],
    });
  });

  it("reports network failures as status 0 without leaking details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await api("/chemicals").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR", isNetworkError: true });
  });

  it("calls the unauthorized handler on 401 unless the probe suppresses it", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch({ "GET /api/v1/requests": () => apiError(401, "UNAUTHENTICATED") });
    await expect(api("/requests")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(api("/requests", { suppressUnauthorized: true })).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refreshes the CSRF token and retries exactly once after CSRF_FAILED", async () => {
    let posts = 0;
    let tokens = 0;
    const calls = mockFetch({
      "GET /api/v1/auth/csrf": () => ({ body: { data: { csrfToken: `fresh-${++tokens}` } } }),
      "POST /api/v1/requests": () =>
        ++posts === 1 ? apiError(403, "CSRF_FAILED") : { body: { data: { ok: true } } },
    });
    setCsrfToken("stale");
    await expect(api("/requests", { method: "POST", body: {} })).resolves.toEqual({ data: { ok: true } });
    expect(posts).toBe(2);
    expect(calls.filter((c) => c.method === "POST").map((c) => c.headers.get("x-csrf-token"))).toEqual([
      "stale",
      "fresh-1",
    ]);
  });

  it("gives up after one CSRF retry", async () => {
    let posts = 0;
    mockFetch({ "POST /api/v1/requests": () => (++posts, apiError(403, "CSRF_FAILED")) });
    setCsrfToken("stale");
    await expect(api("/requests", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "CSRF_FAILED",
    });
    expect(posts).toBe(2);
  });
});

describe("error messages", () => {
  it("maps business error codes to plain language", () => {
    expect(describeError(new ApiError(409, "INSUFFICIENT_STOCK", "x"))).toMatch(/Nothing was deducted/);
    expect(describeError(new ApiError(409, "ALREADY_DECIDED", "x"))).toMatch(/already decided/);
    expect(describeError(new ApiError(403, "SELF_APPROVAL_FORBIDDEN", "x"))).toMatch(/your own request/);
    expect(describeError(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toMatch(/incorrect/);
    expect(describeError(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
  it("flags stale-state errors that need a refresh", () => {
    expect(isStaleStateError(new ApiError(409, "ALREADY_DECIDED", ""))).toBe(true);
    expect(isStaleStateError(new ApiError(422, "OVER_ISSUE", ""))).toBe(true);
    expect(isStaleStateError(new ApiError(400, "VALIDATION_ERROR", ""))).toBe(false);
  });
});

describe("idempotency key store", () => {
  const body = {
    lines: [
      { requestItemId: "b", quantity: 1 },
      { requestItemId: "a", quantity: 2 },
    ],
  };
  it("re-uses the key for an identical payload, regardless of line order", () => {
    const store = new IssueKeyStore();
    const k1 = store.keyFor(body);
    expect(store.keyFor({ lines: [...body.lines].reverse() })).toBe(k1);
    expect(issueSignature(body)).toBe(issueSignature({ lines: [...body.lines].reverse() }));
  });
  it("creates a new key when quantities or the note change, and after reset", () => {
    const store = new IssueKeyStore();
    const k1 = store.keyFor(body);
    expect(
      store.keyFor({
        lines: [
          { requestItemId: "b", quantity: 1 },
          { requestItemId: "a", quantity: 3 },
        ],
      }),
    ).not.toBe(k1);
    const k2 = store.keyFor(body);
    expect(store.keyFor({ ...body, note: "counted twice" })).not.toBe(k2);
    const k3 = store.keyFor(body);
    store.reset();
    expect(store.keyFor(body)).not.toBe(k3);
  });
});

describe("cart", () => {
  const line = (over: Partial<CartLine> = {}): CartLine => ({
    chemicalId: "c1",
    chemicalCode: "DEMO-1",
    chemicalName: "Demo",
    packSizeId: "p1",
    packLabel: "500 ml",
    quantity: 2,
    available: 5,
    ...over,
  });
  it("merges a repeated pack size into one line (the backend forbids duplicates)", () => {
    const next = cartReducer([line()], { type: "add", line: line({ quantity: 3 }) });
    expect(next).toHaveLength(1);
    expect(next[0]?.quantity).toBe(5);
  });
  it("keeps different pack sizes of one chemical separate, never mixing units", () => {
    const next = cartReducer([line()], { type: "add", line: line({ packSizeId: "p2", packLabel: "100 g" }) });
    expect(next.map((l) => l.packLabel)).toEqual(["500 ml", "100 g"]);
  });
  it("edits, removes and clears", () => {
    let cart = cartReducer([], { type: "add", line: line() });
    cart = cartReducer(cart, { type: "setQuantity", packSizeId: "p1", quantity: 9 });
    expect(cartToItems(cart)).toEqual([{ chemicalId: "c1", packSizeId: "p1", quantity: 9 }]);
    expect(cartReducer(cart, { type: "remove", packSizeId: "p1" })).toEqual([]);
    expect(cartReducer(cart, { type: "clear" })).toEqual([]);
  });
  it("flags empty carts and invalid quantities", () => {
    expect(cartProblems([])).toHaveLength(1);
    for (const quantity of [0, -1, 1.5, Number.NaN, 1_000_001])
      expect(cartProblems([line({ quantity })])).toHaveLength(1);
    expect(cartProblems([line()])).toEqual([]);
  });
});

describe("approval and issue body builders", () => {
  const items = [
    makeItem({ id: "i1", requestedQuantity: 5, approvedQuantity: 5, remainingToIssue: 5 }),
    makeItem({ id: "i2", requestedQuantity: 2, approvedQuantity: 2, remainingToIssue: 1, issuedQuantity: 1 }),
  ];
  it("approval defaults to the requested quantities and never allows over-approval", () => {
    expect(buildApproveBody({ items }, false, {}, "  ok  ")).toEqual({ body: { comments: "ok" } });
    expect(buildApproveBody({ items }, true, { i1: "6" }, "")).toMatchObject({
      problem: expect.stringMatching(/cannot approve more/),
    });
    expect(buildApproveBody({ items }, true, { i1: "3", i2: "0" }, "")).toEqual({
      body: {
        approvedQuantities: [
          { requestItemId: "i1", approvedQuantity: 3 },
          { requestItemId: "i2", approvedQuantity: 0 },
        ],
      },
    });
    expect(buildApproveBody({ items }, true, { i1: "0", i2: "0" }, "")).toMatchObject({
      problem: expect.stringMatching(/Reject/),
    });
    expect(buildApproveBody({ items }, true, { i1: "1.5" }, "")).toMatchObject({
      problem: expect.stringMatching(/whole number/),
    });
  });
  it("issue defaults to the remaining quantity and refuses more than remains", () => {
    expect(buildIssueBody(items, {}, "")).toEqual({
      body: {
        lines: [
          { requestItemId: "i1", quantity: 5 },
          { requestItemId: "i2", quantity: 1 },
        ],
      },
    });
    expect(buildIssueBody(items, { i1: "2", i2: "0" }, " counted ")).toEqual({
      body: { lines: [{ requestItemId: "i1", quantity: 2 }], note: "counted" },
    });
    expect(buildIssueBody(items, { i2: "2" }, "")).toMatchObject({
      problem: expect.stringMatching(/only 1 approved/),
    });
    expect(buildIssueBody(items, { i1: "0", i2: "0" }, "")).toMatchObject({
      problem: expect.stringMatching(/above zero/),
    });
    expect(buildIssueBody(items, { i1: "-1" }, "")).toMatchObject({
      problem: expect.stringMatching(/whole number/),
    });
  });
});

describe("timeline", () => {
  it("is derived only from real records, in time order, and flags the approximate cancel time", () => {
    const request = makeRequest({
      status: "ISSUED",
      decidedAt: "2026-10-01T10:00:00.000Z",
      items: [makeItem({ id: "i1", approvedQuantity: 4, issuedQuantity: 4 })],
      approvalActions: [
        {
          id: "a1",
          decision: "APPROVED",
          comments: null,
          createdAt: "2026-10-01T10:00:00.000Z",
          reviewer: { id: "r", employeeCode: "ADM", fullName: "Admin One" },
        },
      ],
      issues: [
        {
          id: "t1",
          requestItemId: "i1",
          quantity: 4,
          createdAt: "2026-10-01T11:00:00.000Z",
          performedBy: { id: "s", employeeCode: "SK", fullName: "Store Keeper" },
        },
      ],
    });
    const events = buildTimeline(request);
    expect(events.map((e) => e.title)).toEqual([
      "Draft created",
      "Submitted as REQ-2026-000001",
      "Approved",
      "Chemicals issued",
    ]);
    expect(events[2]?.detail).toMatch(/does not mean the chemicals have been handed over/);
    expect(events[3]?.detail).toBe("Demo Acid A: 4 × 500 ml");
    const cancelled = buildTimeline(
      makeRequest({ status: "CANCELLED", submittedAt: null, requestNumber: null }),
    );
    expect(cancelled.at(-1)).toMatchObject({ title: "Cancelled", approximate: true });
    expect(cancelled.some((e) => e.title.startsWith("Submitted"))).toBe(false);
  });
  it("shows the rejection reason", () => {
    const rejected = buildTimeline(
      makeRequest({
        status: "REJECTED",
        approvalActions: [
          {
            id: "a1",
            decision: "REJECTED",
            comments: "Not needed this month",
            createdAt: "2026-10-02T10:00:00.000Z",
            reviewer: { id: "r", employeeCode: "ADM", fullName: "Admin One" },
          },
        ],
      }),
    );
    expect(rejected.find((e) => e.title === "Rejected")?.detail).toBe("Reason: Not needed this month");
  });
});

describe("role-based navigation", () => {
  it("only offers role-specific entries to the matching role", () => {
    const labels = (r: "EMPLOYEE" | "ADMIN" | "STOREKEEPER") => navFor(r).map((n) => n.label);
    expect(labels("EMPLOYEE")).toEqual(["Dashboard", "Chemicals", "New request", "My requests"]);
    expect(labels("ADMIN")).toContain("Review queue");
    expect(labels("ADMIN")).not.toContain("Issue desk");
    expect(labels("STOREKEEPER")).toContain("Issue desk");
    expect(labels("STOREKEEPER")).not.toContain("Review queue");
  });
});
