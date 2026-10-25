import { z } from "../../common/zod.js";

export const approveBody = z.strictObject({
  comments: z.string().trim().max(1000).optional(),
  approvedQuantities: z
    .array(
      z.strictObject({ requestItemId: z.uuid(), approvedQuantity: z.number().int().min(0).max(1_000_000) }),
    )
    .max(50)
    .optional()
    .openapi({
      description:
        "Optional partial approval. Omitted items are approved at the requested quantity; approved can never exceed requested.",
    }),
});

export const rejectBody = z.strictObject({
  reason: z.string().trim().min(10, "give a meaningful reason (min 10 characters)").max(1000),
});
