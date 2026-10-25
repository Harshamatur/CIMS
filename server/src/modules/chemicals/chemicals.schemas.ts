import { z } from "../../common/zod.js";
import { pageQuerySchema } from "../../common/pagination.js";
import {
  baseUnitSchema,
  envelope,
  isoDateTime,
  optionalText,
  pagedEnvelope,
  unitTypeSchema,
} from "../../common/schemas.js";

/** base_quantity is expressed in the pack's base unit (g, ml or piece) with at most 3 decimals. */
const baseQuantity = z
  .number()
  .positive()
  .max(1_000_000_000)
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, "at most 3 decimal places");

export const packSizeInput = z.strictObject({
  label: z.string().trim().min(1).max(40).openapi({ example: "500 ml" }),
  unitType: unitTypeSchema,
  baseQuantity: baseQuantity.openapi({
    description: "Quantity of ONE pack in its base unit (g for MASS, ml for VOLUME, piece for COUNT)",
    example: 500,
  }),
});

export const createChemicalBody = z.strictObject({
  chemicalCode: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "letters, digits, . _ - only"),
  name: z.string().trim().min(2).max(200),
  description: optionalText(2000),
  category: optionalText(100),
  hazardNotes: optionalText(2000),
  storageLocation: optionalText(60),
  minimumStockAlert: z.number().int().min(0).max(1_000_000).default(0),
  packSizes: z
    .array(packSizeInput)
    .max(20)
    .default([])
    .refine(
      (a) => new Set(a.map((p) => p.label.toLowerCase())).size === a.length,
      "duplicate pack size labels",
    ),
});

export const updateChemicalBody = z
  .strictObject({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    category: z.string().trim().max(100).nullable().optional(),
    hazardNotes: z.string().trim().max(2000).nullable().optional(),
    storageLocation: z.string().trim().max(60).nullable().optional(),
    minimumStockAlert: z.number().int().min(0).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "at least one field is required");

export const updatePackSizeBody = z
  .strictObject({ label: z.string().trim().min(1).max(40).optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "at least one field is required");

export const listChemicalsQuery = pageQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .openapi({ description: "Search chemical code, name or storage location" }),
  category: z.string().trim().max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const packParams = z.object({ id: z.uuid(), packSizeId: z.uuid() });

const balanceView = z.object({
  available: z.number().int(),
  lowStock: z.boolean(),
  onHand: z.number().int().optional(),
  reserved: z.number().int().optional(),
  minimumQuantity: z.number().int().optional(),
});

export const packSizeSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    unitType: unitTypeSchema,
    baseUnit: baseUnitSchema,
    baseQuantity: z.string(),
    isActive: z.boolean(),
    balance: balanceView.nullable(),
  })
  .openapi("PackSize");

export const chemicalSchema = z
  .object({
    id: z.uuid(),
    chemicalCode: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    category: z.string().nullable(),
    hazardNotes: z.string().nullable(),
    storageLocation: z.string().nullable(),
    minimumStockAlert: z.number().int(),
    isActive: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    packSizes: z.array(packSizeSchema),
  })
  .openapi("Chemical");

export const chemicalResponse = envelope(chemicalSchema);
export const chemicalListResponse = pagedEnvelope(chemicalSchema);
export const packSizeResponse = envelope(packSizeSchema);
