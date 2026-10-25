import { z } from "./zod.js";

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageQuery = z.output<typeof pageQuerySchema>;

export const skipTake = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export const pageMeta = (q: PageQuery, total: number): PageMeta => ({
  page: q.page,
  pageSize: q.pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
});

/** Hard ceiling for CSV exports so a single request cannot dump the whole database. */
export const CSV_EXPORT_MAX_ROWS = 10_000;
