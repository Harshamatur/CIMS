import { pino } from "pino";
import { pinoHttp } from "pino-http";
import type { Env } from "../config/env.js";

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
        'req.headers["x-csrf-token"]',
        "*.password",
        "*.passwordHash",
        "*.newPassword",
        "*.connectionString",
        "*.DATABASE_URL",
        "*.DIRECT_URL",
        "*.SESSION_SECRET",
      ],
      censor: "[redacted]",
    },
  });
}
export type Logger = ReturnType<typeof createLogger>;

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as { id?: string }).id ?? "unknown",
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url.split("?")[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
