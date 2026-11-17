import type { ApiErrorBody, FieldError } from "@/types/api";

/** Error thrown for every non-2xx response and for network failures (status 0). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: FieldError[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// The CSRF token lives in memory only (never localStorage). The session itself is an HttpOnly cookie.
let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};
export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = handler;
};

type QueryValue = string | number | boolean | null | undefined;
export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Used by the session probe: a 401 is an expected answer, not a "session expired" event. */
  suppressUnauthorized?: boolean;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    body = undefined;
  }
  const e = body?.error;
  return new ApiError(
    res.status,
    e?.code ?? `HTTP_${res.status}`,
    e?.message ?? `The server responded with status ${res.status}.`,
    e?.fieldErrors,
    e?.requestId ?? res.headers.get("x-request-id") ?? undefined,
  );
}

async function fetchCsrfToken(): Promise<string> {
  const data = await api<{ data: { csrfToken: string } }>("/auth/csrf", { suppressUnauthorized: true });
  csrfToken = data.data.csrfToken;
  return csrfToken;
}

export async function api<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (UNSAFE.has(method)) headers["X-CSRF-Token"] = csrfToken ?? (await fetchCsrfToken());

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: "include",
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const error = await parseError(res);
  // A stale/missing CSRF token means the request was NOT processed, so one refresh-and-retry is safe.
  if (error.status === 403 && error.code === "CSRF_FAILED" && UNSAFE.has(method) && !isRetry) {
    await fetchCsrfToken();
    return api<T>(path, options, true);
  }
  if (error.status === 401 && !options.suppressUnauthorized) {
    csrfToken = null;
    unauthorizedHandler?.();
  }
  throw error;
}

export const get = <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
  api<T>(path, { query, signal });
export const post = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: "POST", body: body ?? {}, headers });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
