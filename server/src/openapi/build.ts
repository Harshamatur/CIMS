import { OpenApiGeneratorV31, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "../common/zod.js";
import type { RouteMeta } from "../common/api-router.js";

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string(),
      fieldErrors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
      requestId: z.string().openapi({ example: "3f1c0f0e-8d36-4a77-9d0e-0d0b5f4d0a11" }),
    }),
  })
  .openapi("ErrorResponse");

const STANDARD_ERRORS: Record<number, string> = {
  400: "Validation error (VALIDATION_ERROR)",
  401: "Not authenticated (UNAUTHENTICATED)",
  403: "Forbidden (FORBIDDEN / CSRF_FAILED)",
  404: "Not found (NOT_FOUND)",
  409: "Conflict (INVALID_STATE_TRANSITION, ALREADY_DECIDED, INSUFFICIENT_STOCK, IDEMPOTENCY_CONFLICT, ...)",
  422: "Business rule violation",
  429: "Rate limited (RATE_LIMITED)",
};

const toOpenApiPath = (p: string): string => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const asObject = (s: z.ZodType | undefined): z.ZodObject | undefined =>
  s && "shape" in s ? (s as z.ZodObject) : undefined;

export function buildOpenApiDocument(catalog: readonly RouteMeta[], serverUrl = "/api/v1") {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "cims.sid",
    description:
      "Server-side session cookie (HttpOnly). State-changing requests must also send the X-CSRF-Token header returned by GET /auth/csrf, POST /auth/login or GET /auth/me.",
  });
  registry.register("ErrorResponse", errorResponseSchema);

  for (const r of catalog) {
    const protectedRoute = r.access !== "public";
    const responses: Record<
      string,
      { description: string; content?: Record<string, { schema: z.ZodType }> }
    > = {};
    responses[String(r.successStatus)] = r.raw
      ? { description: "Success (non-JSON body, e.g. CSV)" }
      : {
          description: "Success",
          ...(r.response ? { content: { "application/json": { schema: r.response } } } : {}),
        };
    const errorCodes = new Set<number>([400, ...r.errorStatuses]);
    if (protectedRoute) {
      errorCodes.add(401);
      errorCodes.add(403);
    }
    if (r.method !== "get") errorCodes.add(403);
    if (r.path.includes(":")) errorCodes.add(404);
    for (const code of errorCodes) {
      responses[String(code)] = {
        description: STANDARD_ERRORS[code] ?? "Error",
        content: { "application/json": { schema: errorResponseSchema } },
      };
    }
    const roles = Array.isArray(r.access)
      ? ` Allowed roles: ${(r.access as string[]).join(", ")}.`
      : r.access === "authenticated"
        ? " Any authenticated user."
        : " Public.";
    registry.registerPath({
      method: r.method,
      path: toOpenApiPath(r.path),
      summary: r.summary,
      description: `${r.description ?? ""}${roles}`.trim(),
      tags: r.tags,
      security: protectedRoute ? [{ sessionCookie: [] }] : [],
      request: {
        params: asObject(r.params),
        query: asObject(r.query),
        headers: asObject(r.headers),
        ...(r.body ? { body: { required: true, content: { "application/json": { schema: r.body } } } } : {}),
      },
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "CIMS API",
      version: "0.1.0",
      description:
        "Chemical Inventory and Issue Management System — fictional proof-of-work prototype. Not an officially approved or production-certified system.",
    },
    servers: [{ url: serverUrl }],
    tags: [],
  });
}
