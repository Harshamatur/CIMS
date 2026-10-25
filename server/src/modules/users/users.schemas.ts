import { z } from "../../common/zod.js";
import { pageQuerySchema } from "../../common/pagination.js";
import { passwordPolicy } from "../../common/password.js";
import { envelope, isoDateTime, pagedEnvelope, roleSchema, userStatusSchema } from "../../common/schemas.js";

export const userSchema = z
  .object({
    id: z.uuid(),
    employeeCode: z.string(),
    fullName: z.string(),
    email: z.string().nullable(),
    role: roleSchema,
    status: userStatusSchema,
    lastLoginAt: isoDateTime.nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .openapi("User");

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const createUserBody = z.strictObject({
  employeeCode: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, "letters, digits, . _ - only"),
  fullName: z.string().trim().min(2).max(150),
  email: emailField.optional(),
  role: roleSchema,
  initialPassword: passwordPolicy,
});

export const updateUserBody = z
  .strictObject({
    fullName: z.string().trim().min(2).max(150).optional(),
    email: emailField.nullable().optional(),
    role: roleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "at least one field is required");

export const resetPasswordBody = z.strictObject({ newPassword: passwordPolicy });

export const listUsersQuery = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const userResponse = envelope(userSchema);
export const userListResponse = pagedEnvelope(userSchema);
