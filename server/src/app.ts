import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { ApiRouter } from "./common/api-router.js";
import { getEnv, type Env } from "./config/env.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createLogger, httpLogger } from "./middleware/logger.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { createSessionMiddleware } from "./middleware/session.js";
import { registerApprovalRoutes } from "./modules/approvals/approvals.routes.js";
import { registerAuditRoutes } from "./modules/audit/audit.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerChemicalRoutes } from "./modules/chemicals/chemicals.routes.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { registerInventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { registerReportRoutes } from "./modules/reports/reports.routes.js";
import { registerRequestRoutes } from "./modules/requests/requests.routes.js";
import { registerStockRoutes } from "./modules/stock-transactions/stock.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";
import { buildOpenApiDocument } from "./openapi/build.js";

/** Registers every API route on a fresh ApiRouter; also used to generate the OpenAPI document without a database. */
export function buildApi(validateResponses: boolean): ApiRouter {
  const api = new ApiRouter({ validateResponses });
  registerAuthRoutes(api);
  registerUserRoutes(api);
  registerChemicalRoutes(api);
  registerDashboardRoutes(api);
  registerInventoryRoutes(api);
  registerRequestRoutes(api);
  registerApprovalRoutes(api);
  registerStockRoutes(api);
  registerReportRoutes(api);
  registerAuditRoutes(api);
  return api;
}

export function createApp(env: Env = getEnv()): Express {
  const logger = createLogger(env);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);

  app.use(requestId);
  app.use(httpLogger(logger));

  const api = buildApi(env.NODE_ENV === "test");

  if (env.swaggerEnabled) {
    // Swagger UI needs inline scripts/styles; the relaxed CSP is scoped to /docs only.
    const docsHelmet = helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    });
    const document = buildOpenApiDocument(api.catalog);
    app.get("/api/v1/openapi.json", (_req, res) => void res.json(document));
    app.use("/docs", docsHelmet, swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: "CIMS API" }));
  }

  app.use(helmet());
  app.use(
    cors({
      origin: new URL(env.APP_ORIGIN).origin,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "Idempotent-Replay"],
      maxAge: 600,
    }),
  );
  app.use(createHealthRouter(logger));
  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/api/v1",
    apiRateLimiter(),
    createSessionMiddleware(env),
    csrfProtection(env.APP_ORIGIN),
    api.router,
  );

  app.use(notFoundHandler);
  app.use(errorHandler(logger, env.isProduction));
  return app;
}
