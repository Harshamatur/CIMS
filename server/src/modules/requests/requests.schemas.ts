import { z } from "../../common/zod.js";
import { pageQuerySchema } from "../../common/pagination.js";
import { REQUEST_STATUSES } from "../../common/state-machine.js";
import {
  dateRangeQuery,
  envelope,
  isoDateTime,
  pagedEnvelope,
  requestStatusSchema,
  unitTypeSchema,
} from "../../common/schemas.js";

const itemInput = z.strictObject({
  chemicalId: z.uuid(),
  packSizeId: z.uuid(),
  quantity: z
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .openapi({ description: "Number of packs of the chosen pack size" }),
});

const uniqueItems = (items: { packSizeId: string }[]) =>
  new Set(items.map((i) => i.packSizeId)).size === items.length;

export const createRequestBody = z.strictObject({
  purpose: z.string().trim().min(5, "describe the purpose (min 5 characters)").max(1000),
  department: z.string().trim().max(100).optional(),
  items: z
    .array(itemInput)
    .min(1)
    .max(50)
    .refine(uniqueItems, "each pack size may appear only once per request"),
});

export const updateRequestBody = z
  .strictObject({
    purpose: z.string().trim().min(5).max(1000).optional(),
    department: z.string().trim().max(100).nullable().optional(),
    items: z
      .array(itemInput)
      .min(1)
      .max(50)
      .refine(uniqueItems, "each pack size may appear only once per request")
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "at least one field is required");

export const cancelBody = z.strictObject({ reason: z.string().trim().min(3).max(500).optional() });

const statusList = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const parts = v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = parts.filter((p) => !(REQUEST_STATUSES as readonly string[]).includes(p));
    if (bad.length) {
      ctx.addIssue({ code: "custom", message: `unknown status: ${bad.join(", ")}` });
      return z.NEVER;
    }
    return parts as (typeof REQUEST_STATUSES)[number][];
  })
  .openapi({ type: "string", description: "Comma-separated statuses, e.g. APPROVED,PARTIALLY_ISSUED" });

export const listRequestsQuery = pageQuerySchema.extend(dateRangeQuery.shape).extend({
  status: statusList,
  q: z.string().trim().max(50).optional().openapi({ description: "Match request number" }),
  requestedBy: z.uuid().optional().openapi({ description: "ADMIN only: filter by requester" }),
});

export const requestCountsQuery = z.strictObject({ requestedBy: z.uuid().optional() });

const personSchema = z.object({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() });

export const requestItemSchema = z
  .object({
    id: z.uuid(),
    chemical: z.object({
      id: z.uuid(),
      chemicalCode: z.string(),
      name: z.string(),
      storageLocation: z.string().nullable(),
    }),
    packSize: z.object({ id: z.uuid(), label: z.string(), unitType: unitTypeSchema }),
    availability: z.object({ available: z.number().int(), lowStock: z.boolean() }).nullable(),
    requestedQuantity: z.number().int(),
    approvedQuantity: z.number().int().nullable(),
    issuedQuantity: z.number().int(),
    remainingToIssue: z.number().int(),
  })
  .openapi("RequestItem");

export const requestSummarySchema = z
  .object({
    id: z.uuid(),
    requestNumber: z.string().nullable(),
    status: requestStatusSchema,
    purpose: z.string(),
    department: z.string().nullable(),
    requester: personSchema,
    itemCount: z.number().int(),
    submittedAt: isoDateTime.nullable(),
    decidedAt: isoDateTime.nullable(),
    decidedBy: personSchema.nullable(),
    rejectionReason: z.string().nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .openapi("RequestSummary");

export const requestDetailSchema = requestSummarySchema
  .extend({
    items: z.array(requestItemSchema),
    approvalActions: z.array(
      z.object({
        id: z.uuid(),
        decision: z.enum(["APPROVED", "REJECTED"]),
        comments: z.string().nullable(),
        createdAt: isoDateTime,
        reviewer: personSchema,
      }),
    ),
    issues: z.array(
      z.object({
        id: z.uuid(),
        requestItemId: z.uuid(),
        quantity: z.number().int(),
        createdAt: isoDateTime,
        performedBy: personSchema,
      }),
    ),
  })
  .openapi("RequestDetail");

export const requestResponse = envelope(requestDetailSchema);
export const requestListResponse = pagedEnvelope(requestSummarySchema);
export const requestCountsResponse = envelope(
  z.object({
    DRAFT: z.number().int().nonnegative(),
    SUBMITTED: z.number().int().nonnegative(),
    APPROVED: z.number().int().nonnegative(),
    REJECTED: z.number().int().nonnegative(),
    PARTIALLY_ISSUED: z.number().int().nonnegative(),
    ISSUED: z.number().int().nonnegative(),
    CANCELLED: z.number().int().nonnegative(),
  }),
);
