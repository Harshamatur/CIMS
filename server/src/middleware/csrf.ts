import { timingSafeEqual, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "../common/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const newCsrfToken = (): string => randomBytes(32).toString("base64url");

function tokensMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests (defence in depth):
 *  1. If an Origin header is present it must equal APP_ORIGIN.
 *  2. A synchroniser token stored in the server-side session must be echoed in `X-CSRF-Token`.
 * Token is obtained from GET /auth/csrf, POST /auth/login and GET /auth/me.
 */
export function csrfProtection(appOrigin: string): RequestHandler {
  const allowed = new URL(appOrigin).origin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.header("origin");
    if (origin && origin !== allowed)
      return next(new AppError(403, "CSRF_FAILED", "Request origin is not allowed."));
    const expected = req.session?.csrfToken;
    const supplied = req.header("x-csrf-token");
    if (!expected || !supplied || !tokensMatch(expected, supplied)) {
      return next(new AppError(403, "CSRF_FAILED", "Missing or invalid CSRF token."));
    }
    next();
  };
}
