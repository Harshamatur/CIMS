import { rateLimit } from "express-rate-limit";
import type { Env } from "../config/env.js";

/** Per-IP limiter for login attempts. In-memory: per instance (see docs/security.md for multi-instance notes). */
export function loginRateLimiter(
  env: Pick<Env, "LOGIN_RATE_LIMIT_MAX" | "LOGIN_RATE_LIMIT_WINDOW_MINUTES" | "NODE_ENV">,
) {
  return rateLimit({
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many login attempts. Try again later.",
          requestId: String(req.id),
        },
      });
    },
  });
}

/** Coarse global limiter to blunt scraping / brute-force on every endpoint. */
export function apiRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
      res
        .status(429)
        .json({ error: { code: "RATE_LIMITED", message: "Too many requests.", requestId: String(req.id) } });
    },
  });
}
