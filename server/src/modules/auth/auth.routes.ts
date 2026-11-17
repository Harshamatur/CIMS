import { ApiRouter } from "../../common/api-router.js";
import { getEnv } from "../../config/env.js";
import { loginRateLimiter } from "../../middleware/rate-limit.js";
import { capabilitiesResponse, csrfResponse, okResponse } from "./auth.schemas.js";
import { loginBody, sessionResponse } from "./auth.schemas.js";
import { ensureCsrfToken, login, logout } from "./auth.service.js";

export function registerAuthRoutes(api: ApiRouter): void {
  const env = getEnv();
  // Login attempts are rate-limited per IP before any credential work happens.
  api.router.use("/auth/login", loginRateLimiter(env));

  api.route({
    method: "get",
    path: "/auth/capabilities",
    summary: "Current role feature capabilities",
    tags: ["Auth"],
    access: "authenticated",
    response: capabilitiesResponse,
    handler: async () => ({ data: { allowAdminIssue: env.ALLOW_ADMIN_ISSUE } }),
  });

  api.route({
    method: "get",
    path: "/auth/csrf",
    summary: "Obtain a CSRF token (creates an anonymous session if needed)",
    tags: ["Auth"],
    access: "public",
    response: csrfResponse,
    handler: async ({ req }) => ({ data: { csrfToken: await ensureCsrfToken(req) } }),
  });

  api.route({
    method: "post",
    path: "/auth/login",
    summary: "Log in",
    description:
      "Creates a server-side session (HttpOnly cookie). All failures — unknown user, wrong password, inactive or locked account — return the same 401 INVALID_CREDENTIALS. Requires X-CSRF-Token from GET /auth/csrf. Rate limited per IP.",
    tags: ["Auth"],
    access: "public",
    body: loginBody,
    response: sessionResponse,
    errorStatuses: [401, 429],
    handler: async ({ req, body, ctx }) => ({ data: await login(req, ctx, body.identifier, body.password) }),
  });

  api.route({
    method: "post",
    path: "/auth/logout",
    summary: "Log out (invalidates the server-side session)",
    tags: ["Auth"],
    access: "authenticated",
    response: okResponse,
    handler: async ({ req, res, ctx }) => {
      await logout(req, ctx, env.SESSION_COOKIE_NAME, res);
      return { data: { ok: true as const } };
    },
  });

  api.route({
    method: "get",
    path: "/auth/me",
    summary: "Current user and CSRF token",
    tags: ["Auth"],
    access: "authenticated",
    response: sessionResponse,
    handler: async ({ req, user }) => ({ data: { user, csrfToken: await ensureCsrfToken(req) } }),
  });
}
