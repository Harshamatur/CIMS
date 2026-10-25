import { describe, expect, it } from "vitest";
import type { RouteMeta } from "../../src/common/api-router.js";
import { z } from "../../src/common/zod.js";
import { buildOpenApiDocument } from "../../src/openapi/build.js";
import { approveBody } from "../../src/modules/approvals/approvals.schemas.js";
import { chemicalResponse, listChemicalsQuery } from "../../src/modules/chemicals/chemicals.schemas.js";
import { idParams, idempotencyKeyHeader } from "../../src/common/schemas.js";
import { requestResponse } from "../../src/modules/requests/requests.schemas.js";
import { issueBody } from "../../src/modules/stock-transactions/stock.schemas.js";

// Exercises the OpenAPI builder with the real module schemas. It does not need the route handlers
// (which import the Prisma client), so it runs without a generated client or a database.
const catalog: RouteMeta[] = [
  {
    method: "get",
    path: "/chemicals",
    summary: "Search",
    tags: ["Chemicals"],
    access: "authenticated",
    query: listChemicalsQuery,
    response: chemicalResponse,
    successStatus: 200,
    errorStatuses: [],
    raw: false,
  },
  {
    method: "post",
    path: "/requests/:id/approve",
    summary: "Approve",
    tags: ["Approvals"],
    access: ["ADMIN"],
    params: idParams,
    body: approveBody,
    response: requestResponse,
    successStatus: 200,
    errorStatuses: [409],
    raw: false,
  },
  {
    method: "post",
    path: "/requests/:id/issue",
    summary: "Issue",
    tags: ["Stock"],
    access: ["STOREKEEPER"],
    params: idParams,
    body: issueBody,
    headers: idempotencyKeyHeader,
    response: z.object({ data: requestResponse }),
    successStatus: 200,
    errorStatuses: [409, 422],
    raw: false,
  },
  {
    method: "get",
    path: "/auth/csrf",
    summary: "CSRF",
    tags: ["Auth"],
    access: "public",
    response: z.object({ data: z.object({ csrfToken: z.string() }) }),
    successStatus: 200,
    errorStatuses: [],
    raw: false,
  },
];

describe("OpenAPI 3.1 generation", () => {
  const doc = buildOpenApiDocument(catalog);

  it("produces an OpenAPI 3.1 document with converted path parameters", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining(["/chemicals", "/requests/{id}/approve", "/requests/{id}/issue", "/auth/csrf"]),
    );
  });
  it("documents the session-cookie security scheme and protects non-public routes only", () => {
    expect(doc.components?.securitySchemes).toHaveProperty("sessionCookie");
    expect(doc.paths?.["/requests/{id}/approve"]?.post?.security).toEqual([{ sessionCookie: [] }]);
    expect(doc.paths?.["/auth/csrf"]?.get?.security).toEqual([]);
  });
  it("documents the standard error envelope and the required Idempotency-Key header", () => {
    const issue = doc.paths?.["/requests/{id}/issue"]?.post;
    expect(Object.keys(issue?.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "400", "401", "403", "404", "409", "422"]),
    );
    const headerNames = (issue?.parameters ?? []).map((p) => ("name" in p ? p.name : ""));
    expect(headerNames).toContain("idempotency-key");
  });
  it("includes the role list in the description", () => {
    expect(doc.paths?.["/requests/{id}/approve"]?.post?.description).toContain("ADMIN");
  });
});
