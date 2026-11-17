import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api-client";
import type { Chemical, Envelope, Paged } from "@/types/api";

export interface ChemicalListParams {
  q?: string;
  category?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export const useChemicals = (params: ChemicalListParams) =>
  useQuery({
    queryKey: ["chemicals", params],
    queryFn: ({ signal }) => get<Paged<Chemical>>("/chemicals", { ...params }, signal),
    placeholderData: keepPreviousData,
  });

export const useChemical = (id: string, enabled = true) =>
  useQuery({
    queryKey: ["chemical", id],
    queryFn: async ({ signal }) =>
      (await get<Envelope<Chemical>>(`/chemicals/${id}`, undefined, signal)).data,
    enabled,
    staleTime: 10_000,
  });
