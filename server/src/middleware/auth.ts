import type { RequestHandler } from "express";
import { forbidden, unauthenticated } from "../common/errors.js";
import type { Role } from "../common/permissions.js";
import { getPrisma } from "../db/client.js";
import type { AuthUser } from "../types.js";

/**
 * Loads the user on EVERY request so that deactivation / lock / role change takes effect immediately,
 * rather than trusting role data cached in the session.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const userId = req.session?.userId;
  if (!userId) return next(unauthenticated());
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { id: true, employeeCode: true, fullName: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return next(unauthenticated("Session is no longer valid."));
  }
  req.user = user as AuthUser;
  next();
};

export const requireRoles =
  (roles: readonly Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
