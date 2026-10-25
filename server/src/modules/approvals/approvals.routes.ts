import { ApiRouter } from "../../common/api-router.js";
import { rolesFor } from "../../common/permissions.js";
import { idParams } from "../../common/schemas.js";
import { requestResponse } from "../requests/requests.schemas.js";
import { approveBody, rejectBody } from "./approvals.schemas.js";
import { approveRequest, rejectRequest } from "./approvals.service.js";

export function registerApprovalRoutes(api: ApiRouter): void {
  const access = rolesFor("requests:review");
  api.route({
    method: "post",
    path: "/requests/:id/approve",
    summary: "Approve a submitted request",
    description:
      "Approval does NOT deduct stock. Optional partial approval per item (never above the requested quantity). 409 ALREADY_DECIDED if another reviewer got there first; 403 SELF_APPROVAL_FORBIDDEN for your own request.",
    tags: ["Approvals"],
    access,
    params: idParams,
    body: approveBody,
    response: requestResponse,
    errorStatuses: [409, 422],
    handler: async ({ params, body, user, ctx }) => ({
      data: await approveRequest(ctx, user, params.id, body),
    }),
  });
  api.route({
    method: "post",
    path: "/requests/:id/reject",
    summary: "Reject a submitted request (reason required)",
    tags: ["Approvals"],
    access,
    params: idParams,
    body: rejectBody,
    response: requestResponse,
    errorStatuses: [409],
    handler: async ({ params, body, user, ctx }) => ({
      data: await rejectRequest(ctx, user, params.id, body.reason),
    }),
  });
}
