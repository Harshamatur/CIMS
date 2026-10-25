import { Router } from "express";
import { getPrisma } from "../../db/client.js";

/**
 * /health: process liveness only (no database access).
 * /ready: verifies the database answers a trivial query. Failures return 503 with a generic body —
 * no connection details, hostnames or driver messages are ever exposed.
 */
export function createHealthRouter(logger: { error: (o: object, m: string) => void }): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  router.get("/ready", async (req, res) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ready" });
    } catch (err) {
      logger.error({ err, requestId: req.id }, "readiness check failed");
      res.status(503).json({ status: "unavailable" });
    }
  });
  return router;
}
