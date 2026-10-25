import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";
import type { Env } from "../config/env.js";
import { getSessionPool } from "../db/client.js";

export function sessionCookieOptions(env: Pick<Env, "isProduction" | "SESSION_TTL_HOURS">) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  };
}

/** Server-side sessions stored in PostgreSQL (table `session`, created by migration 0001). The cookie holds only the opaque id. */
export function createSessionMiddleware(env: Env): RequestHandler {
  const PgStore = connectPgSimple(session);
  return session({
    store: new PgStore({ pool: getSessionPool(), tableName: "session", createTableIfMissing: false }),
    name: env.SESSION_COOKIE_NAME,
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: sessionCookieOptions(env),
  });
}
