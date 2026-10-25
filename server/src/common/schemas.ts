import { z } from "./zod.js";

export const uuid = z.uuid();
export const idParams = z.object({ id: uuid });
export const isoDateTime = z.iso.datetime({ offset: true });

export const roleSchema = z.enum(["EMPLOYEE", "ADMIN", "STOREKEEPER"]).openapi("Role");
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).openapi("UserStatus");
export const requestStatusSchema = z
  .enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PARTIALLY_ISSUED", "ISSUED", "CANCELLED"])
  .openapi("RequestStatus");
export const transactionTypeSchema = z
  .enum(["RECEIPT", "ISSUE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL"])
  .openapi("TransactionType");
export const unitTypeSchema = z.enum(["MASS", "VOLUME", "COUNT"]).openapi("UnitType");
export const baseUnitSchema = z.enum(["g", "ml", "piece"]).openapi("BaseUnit");

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const envelope = <T extends z.ZodType>(data: T) => z.object({ data });
export const pagedEnvelope = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), meta: pageMetaSchema });

/** Optional trimmed string; empty strings become undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

export const dateRangeQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const idempotencyKeyHeader = z.object({
  "idempotency-key": z
    .string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/, "may contain letters, digits, . _ : - only")
    .openapi({
      description:
        "Client-generated unique key (e.g. a UUID). Retrying with the same key never repeats the operation.",
    }),
});

export const optionalIdempotencyKeyHeader = z.object({
  "idempotency-key": idempotencyKeyHeader.shape["idempotency-key"].optional(),
});

export const csvFormatQuery = z.object({ format: z.enum(["json", "csv"]).default("json") });
