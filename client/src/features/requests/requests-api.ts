import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api-client";
import type {
  ApproveBody,
  CreateRequestBody,
  Envelope,
  IssueBody,
  Paged,
  RequestCounts,
  RequestDetail,
  RequestSummary,
} from "@/types/api";

export interface RequestListParams {
  /** Comma-separated statuses, e.g. "APPROVED,PARTIALLY_ISSUED". */
  status?: string;
  q?: string;
  requestedBy?: string;
  page?: number;
  pageSize?: number;
}

export const useRequests = (params: RequestListParams, enabled = true) =>
  useQuery({
    queryKey: ["requests", params],
    queryFn: ({ signal }) => get<Paged<RequestSummary>>("/requests", { ...params }, signal),
    placeholderData: keepPreviousData,
    enabled,
  });

/** Count of requests matching a filter (uses the list endpoint's pagination metadata; no data is invented). */
export const useRequestCount = (params: Omit<RequestListParams, "page" | "pageSize">) =>
  useQuery({
    queryKey: ["request-counts", { requestedBy: params.requestedBy }],
    queryFn: async ({ signal }) =>
      (await get<Envelope<RequestCounts>>("/requests/counts", { requestedBy: params.requestedBy }, signal))
        .data,
    select: (counts) => {
      const statuses = params.status?.split(",") as (keyof RequestCounts)[] | undefined;
      return statuses?.length
        ? statuses.reduce((total, status) => total + (counts[status] ?? 0), 0)
        : Object.values(counts).reduce((total, count) => total + count, 0);
    },
  });

export const useRequest = (id: string) =>
  useQuery({
    queryKey: ["request", id],
    queryFn: async ({ signal }) =>
      (await get<Envelope<RequestDetail>>(`/requests/${id}`, undefined, signal)).data,
  });

/** Invalidate active request lists and dashboard counts after a request changes. */
export function invalidateRequestLists(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["requests"] }),
    qc.invalidateQueries({ queryKey: ["request-counts"] }),
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] }),
  ]);
}

export function invalidateRequestData(qc: QueryClient, id?: string): Promise<unknown> {
  return Promise.all([
    invalidateRequestLists(qc),
    id ? qc.invalidateQueries({ queryKey: ["request", id] }) : Promise.resolve(),
  ]);
}

/** Refresh chemical availability after stock changes, targeting details used by the changed request. */
export function invalidateInventoryData(qc: QueryClient, chemicalIds: readonly string[]): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["chemicals"] }),
    ...[...new Set(chemicalIds)].map((id) => qc.invalidateQueries({ queryKey: ["chemical", id] })),
  ]);
}

export const requestsApi = {
  createDraft: async (body: CreateRequestBody) =>
    (await post<Envelope<RequestDetail>>("/requests", body)).data,
  updateDraft: async (id: string, body: Partial<CreateRequestBody>) =>
    (await patch<Envelope<RequestDetail>>(`/requests/${id}`, body)).data,
  submit: async (id: string) => (await post<Envelope<RequestDetail>>(`/requests/${id}/submit`)).data,
  cancel: async (id: string, reason?: string) =>
    (await post<Envelope<RequestDetail>>(`/requests/${id}/cancel`, reason ? { reason } : {})).data,
  approve: async (id: string, body: ApproveBody) =>
    (await post<Envelope<RequestDetail>>(`/requests/${id}/approve`, body)).data,
  reject: async (id: string, reason: string) =>
    (await post<Envelope<RequestDetail>>(`/requests/${id}/reject`, { reason })).data,
  issue: async (id: string, body: IssueBody, idempotencyKey: string) =>
    (
      await post<Envelope<RequestDetail>>(`/requests/${id}/issue`, body, {
        "Idempotency-Key": idempotencyKey,
      })
    ).data,
};
