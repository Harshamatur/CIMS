import { ApiRouter } from "../../common/api-router.js";
import { rolesFor } from "../../common/permissions.js";
import { idParams } from "../../common/schemas.js";
import { okResponse } from "../auth/auth.schemas.js";
import {
  createUserBody,
  listUsersQuery,
  resetPasswordBody,
  updateUserBody,
  userListResponse,
  userResponse,
} from "./users.schemas.js";
import { createUser, getUser, listUsers, resetPassword, updateUser } from "./users.service.js";

export function registerUserRoutes(api: ApiRouter): void {
  const access = rolesFor("users:manage");
  api.route({
    method: "get",
    path: "/users",
    summary: "List users",
    tags: ["Users"],
    access,
    query: listUsersQuery,
    response: userListResponse,
    handler: async ({ query }) => listUsers(query),
  });
  api.route({
    method: "post",
    path: "/users",
    summary: "Create a user",
    description:
      "Prototype account provisioning by an administrator. The first administrator is created with `npm run admin:create`.",
    tags: ["Users"],
    access,
    body: createUserBody,
    response: userResponse,
    successStatus: 201,
    errorStatuses: [409],
    handler: async ({ body, ctx }) => ({ data: await createUser(ctx, body) }),
  });
  api.route({
    method: "get",
    path: "/users/:id",
    summary: "Get a user",
    tags: ["Users"],
    access,
    params: idParams,
    response: userResponse,
    handler: async ({ params }) => ({ data: await getUser(params.id) }),
  });
  api.route({
    method: "patch",
    path: "/users/:id",
    summary: "Update name, email, role or status",
    description:
      "Deactivating a user or changing their role ends their sessions. Administrators cannot change their own role or deactivate themselves.",
    tags: ["Users"],
    access,
    params: idParams,
    body: updateUserBody,
    response: userResponse,
    errorStatuses: [409],
    handler: async ({ params, body, ctx }) => ({ data: await updateUser(ctx, params.id, body) }),
  });
  api.route({
    method: "post",
    path: "/users/:id/reset-password",
    summary: "Set a new password for a user",
    tags: ["Users"],
    access,
    params: idParams,
    body: resetPasswordBody,
    response: okResponse,
    handler: async ({ params, body, ctx }) => {
      await resetPassword(ctx, params.id, body.newPassword);
      return { data: { ok: true as const } };
    },
  });
}
