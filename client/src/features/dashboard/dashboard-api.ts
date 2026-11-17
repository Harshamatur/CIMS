import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api-client";
import type { DashboardSummary, Envelope } from "@/types/api";

export const useDashboardSummary = () =>
  useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async ({ signal }) =>
      (await get<Envelope<DashboardSummary>>("/dashboard/summary", undefined, signal)).data,
    refetchInterval: 60_000,
  });
