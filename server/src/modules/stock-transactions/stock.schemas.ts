import { z } from "../../common/zod.js";
import { pageQuerySchema } from "../../common/pagination.js";
import {
  dateRangeQuery,
  envelope,
  isoDateTime,
  pagedEnvelope,
  transactionTypeSchema,
} from "../../common/schemas.js";

const quantity = z.number().int().min(1).max(1_000_000);
const target = { chemicalId: z.uuid(), packSizeId: z.uuid(), quantity };

export const receiptBody = z.strictObject({
  ...target,
  reason: z
    .string()
    .trim()
    .min(3)
    .max(500)
    .openapi({ description: "Supplier / GRN / delivery reference", example: "GRN-2026-0042" }),
});

export const adjustmentBody = z.strictObject({
  ...target,
  direction: z.enum(["IN", "OUT"]),
  reason: z.string().trim().min(10, "explain the adjustment (min 10 characters)").max(500),
});

export const reversalBody = z.strictObject({ reason: z.string().trim().min(10).max(500) });

export const issueBody = z.strictObject({
  lines: z
    .array(z.strictObject({ requestItemId: z.uuid(), quantity }))
    .min(1)
    .max(50)
    .refine((l) => new Set(l.map((x) => x.requestItemId)).size === l.length, "duplicate requestItemId"),
  note: z.string().trim().max(500).optional(),
});

export const listTransactionsQuery = pageQuerySchema.extend(dateRangeQuery.shape).extend({
  chemicalId: z.uuid().optional(),
  packSizeId: z.uuid().optional(),
  type: transactionTypeSchema.optional(),
  performedBy: z.uuid().optional(),
  requestId: z.uuid().optional(),
});

export const transactionSchema = z
  .object({
    id: z.uuid(),
    createdAt: isoDateTime,
    transactionType: transactionTypeSchema,
    direction: z.enum(["IN", "OUT"]).openapi({
      description: "IN increases on-hand stock, OUT decreases it. `quantity` is always positive.",
    }),
    quantity: z.number().int(),
    chemical: z.object({ id: z.uuid(), chemicalCode: z.string(), name: z.string() }),
    packSize: z.object({ id: z.uuid(), label: z.string(), unitType: z.string() }),
    requestItemId: z.uuid().nullable(),
    requestId: z.uuid().nullable(),
    performedBy: z.object({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() }),
    reason: z.string().nullable(),
    reversalOfId: z.uuid().nullable(),
  })
  .openapi("StockTransaction");

export const transactionResponse = envelope(transactionSchema);
export const transactionListResponse = pagedEnvelope(transactionSchema);
