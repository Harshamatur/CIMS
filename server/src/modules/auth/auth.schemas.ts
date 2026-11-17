import { z } from "../../common/zod.js";
import { roleSchema, userStatusSchema, envelope } from "../../common/schemas.js";

export const loginBody = z.strictObject({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(254)
    .openapi({ description: "Employee code or work email", example: "EMP-1001" }),
  password: z.string().min(1).max(256),
});

export const sessionUserSchema = z
  .object({
    id: z.uuid(),
    employeeCode: z.string(),
    fullName: z.string(),
    email: z.string().nullable(),
    role: roleSchema,
    status: userStatusSchema,
  })
  .openapi("SessionUser");

export const sessionResponse = envelope(z.object({ user: sessionUserSchema, csrfToken: z.string() })).openapi(
  "SessionResponse",
);
export const csrfResponse = envelope(z.object({ csrfToken: z.string() }));
export const capabilitiesResponse = envelope(z.object({ allowAdminIssue: z.boolean() }));
export const okResponse = envelope(z.object({ ok: z.literal(true) }));
