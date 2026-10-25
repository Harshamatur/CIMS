import { ApiRouter } from "../../common/api-router.js";
import { pageQuerySchema } from "../../common/pagination.js";
import { rolesFor } from "../../common/permissions.js";
import { z } from "../../common/zod.js";
import {
  baseUnitSchema,
  envelope,
  isoDateTime,
  pagedEnvelope,
  unitTypeSchema,
} from "../../common/schemas.js";
import { listBalances, setMinimumQuantity } from "./inventory.service.js";

export const balanceSchema = z
  .object({
    id: z.uuid(),
    chemicalId: z.uuid(),
    chemicalCode: z.string(),
    chemicalName: z.string(),
    storageLocation: z.string().nullable(),
    chemicalActive: z.boolean(),
    packSizeId: z.uuid(),
    packLabel: z.string(),
    unitType: unitTypeSchema,
    baseUnit: baseUnitSchema,
    baseQuantity: z.string(),
    packActive: z.boolean(),
    onHandQuantity: z.number().int().openapi({ description: "Physical packs in the store" }),
    reservedQuantity: z
      .number()
      .int()
      .openapi({ description: "Always 0 in this prototype: stock is not reserved on submission" }),
    availableQuantity: z.number().int().openapi({ description: "on_hand - reserved; never negative" }),
    minimumQuantity: z.number().int(),
    lowStock: z
      .boolean()
      .openapi({ description: "true when minimumQuantity > 0 and available <= minimumQuantity" }),
    version: z.number().int(),
    updatedAt: isoDateTime,
  })
  .openapi("InventoryBalance");

export const balanceQuery = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  chemicalId: z.uuid().optional(),
  lowOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export function registerInventoryRoutes(api: ApiRouter): void {
  api.route({
    method: "get",
    path: "/inventory",
    summary: "Stock balances per chemical and pack size",
    description:
      "Quantities are whole numbers of packs. Mass and volume pack sizes are never converted or summed.",
    tags: ["Inventory"],
    access: rolesFor("inventory:view-detail"),
    query: balanceQuery,
    response: pagedEnvelope(balanceSchema),
    handler: async ({ query }) => listBalances(query),
  });
  api.route({
    method: "patch",
    path: "/inventory/:packSizeId/threshold",
    summary: "Set the low-stock threshold for a pack size",
    tags: ["Inventory"],
    access: rolesFor("chemicals:manage"),
    params: z.object({ packSizeId: z.uuid() }),
    body: z.strictObject({ minimumQuantity: z.number().int().min(0).max(1_000_000) }),
    response: envelope(balanceSchema),
    handler: async ({ params, body, ctx }) => ({
      data: await setMinimumQuantity(ctx, params.packSizeId, body.minimumQuantity),
    }),
  });
}
