import { ApiRouter } from "../../common/api-router.js";
import { idParams } from "../../common/schemas.js";
import { forbidden } from "../../common/errors.js";
import {
  cancelBody,
  createRequestBody,
  listRequestsQuery,
  requestCountsQuery,
  requestCountsResponse,
  requestListResponse,
  requestResponse,
  updateRequestBody,
} from "./requests.schemas.js";
import {
  cancelRequest,
  countRequests,
  createDraft,
  getRequestDetail,
  listRequests,
  submitRequest,
  updateDraft,
} from "./requests.service.js";

export function registerRequestRoutes(api: ApiRouter): void {
  api.route({
    method: "get",
    path: "/requests",
    summary: "List requests visible to the caller",
    description:
      "EMPLOYEE: own requests. ADMIN: all submitted requests plus own drafts (the pending queue is `?status=SUBMITTED`). STOREKEEPER: approved / partially issued / issued requests plus own.",
    tags: ["Requests"],
    access: "authenticated",
    query: listRequestsQuery,
    response: requestListResponse,
    handler: async ({ query, user }) => {
      if (query.requestedBy && query.requestedBy !== user.id && user.role !== "ADMIN") throw forbidden();
      return listRequests(user, query);
    },
  });
  api.route({
    method: "get",
    path: "/requests/counts",
    summary: "Count visible requests by status",
    description: "Returns grouped counts using the same request visibility rules as the request list.",
    tags: ["Requests"],
    access: "authenticated",
    query: requestCountsQuery,
    response: requestCountsResponse,
    handler: async ({ query, user }) => {
      if (query.requestedBy && query.requestedBy !== user.id && user.role !== "ADMIN") throw forbidden();
      return countRequests(user, query.requestedBy);
    },
  });
  api.route({
    method: "post",
    path: "/requests",
    summary: "Create a draft request (multiple items)",
    description:
      "Every item is validated against current master data. The request number is assigned on submission.",
    tags: ["Requests"],
    access: "authenticated",
    body: createRequestBody,
    response: requestResponse,
    successStatus: 201,
    errorStatuses: [422],
    handler: async ({ body, user, ctx }) => ({ data: await createDraft(ctx, user, body) }),
  });
  api.route({
    method: "get",
    path: "/requests/:id",
    summary: "Request details, approval history and issue history",
    description:
      "Returns 404 (not 403) for requests the caller may not see, so identifiers cannot be probed.",
    tags: ["Requests"],
    access: "authenticated",
    params: idParams,
    response: requestResponse,
    handler: async ({ params, user }) => ({ data: await getRequestDetail(user, params.id) }),
  });
  api.route({
    method: "patch",
    path: "/requests/:id",
    summary: "Edit a draft (owner only)",
    tags: ["Requests"],
    access: "authenticated",
    params: idParams,
    body: updateRequestBody,
    response: requestResponse,
    errorStatuses: [409, 422],
    handler: async ({ params, body, user, ctx }) => ({ data: await updateDraft(ctx, user, params.id, body) }),
  });
  api.route({
    method: "post",
    path: "/requests/:id/submit",
    summary: "Submit a draft for review",
    description:
      "Revalidates all items, assigns the unique request number and places the request in the administrator queue. Submitting twice returns 409.",
    tags: ["Requests"],
    access: "authenticated",
    params: idParams,
    response: requestResponse,
    errorStatuses: [409, 422],
    handler: async ({ params, user, ctx }) => ({ data: await submitRequest(ctx, user, params.id) }),
  });
  api.route({
    method: "post",
    path: "/requests/:id/cancel",
    summary: "Cancel a request",
    description: "Owner: while DRAFT or SUBMITTED. ADMIN: also APPROVED requests with nothing issued yet.",
    tags: ["Requests"],
    access: "authenticated",
    params: idParams,
    body: cancelBody,
    response: requestResponse,
    errorStatuses: [409],
    handler: async ({ params, body, user, ctx }) => ({
      data: await cancelRequest(ctx, user, params.id, body.reason),
    }),
  });
}
