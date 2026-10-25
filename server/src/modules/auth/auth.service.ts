import type { Request } from "express";
import { invalidCredentials } from "../../common/errors.js";
import { burnPasswordCheck, verifyPassword } from "../../common/password.js";
import { getPrisma } from "../../db/client.js";
import { newCsrfToken } from "../../middleware/csrf.js";
import type { AuthUser } from "../../types.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";

const regenerate = (req: Request) =>
  new Promise<void>((res, rej) => req.session.regenerate((e) => (e ? rej(e) : res())));
const save = (req: Request) => new Promise<void>((res, rej) => req.session.save((e) => (e ? rej(e) : res())));
export const destroySession = (req: Request) =>
  new Promise<void>((res, rej) => req.session.destroy((e) => (e ? rej(e) : res())));

export async function login(req: Request, ctx: ServiceContext, identifier: string, password: string) {
  const db = getPrisma();
  const normalised = identifier.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ employeeCode: normalised }, { email: normalised.toLowerCase() }] },
  });

  const passwordOk = user
    ? await verifyPassword(user.passwordHash, password)
    : (await burnPasswordCheck(password), false);

  if (!user || !passwordOk || user.status !== "ACTIVE") {
    // Same response for unknown user, wrong password and inactive/locked account (no account enumeration).
    await recordAudit(
      db,
      { ...ctx, actorId: user?.id ?? null },
      {
        action: "AUTH_LOGIN_FAILED",
        entityType: "user",
        entityId: user?.id ?? null,
        after: {
          reason: !user
            ? "unknown_identifier"
            : !passwordOk
              ? "bad_password"
              : `account_${user.status.toLowerCase()}`,
        },
      },
    );
    throw invalidCredentials();
  }

  await regenerate(req); // prevent session fixation
  const csrfToken = newCsrfToken();
  req.session.userId = user.id;
  req.session.csrfToken = csrfToken;
  await save(req);

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit(
      tx,
      { ...ctx, actorId: user.id },
      { action: "AUTH_LOGIN_SUCCEEDED", entityType: "user", entityId: user.id },
    );
  });

  const sessionUser: AuthUser = {
    id: user.id,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
  };
  return { user: sessionUser, csrfToken };
}

export async function logout(
  req: Request,
  ctx: ServiceContext,
  cookieName: string,
  res: import("express").Response,
) {
  await recordAudit(getPrisma(), ctx, { action: "AUTH_LOGOUT", entityType: "user", entityId: ctx.actorId });
  await destroySession(req);
  res.clearCookie(cookieName, { path: "/" });
}

/** Returns the session's CSRF token, creating one (and a session) on first use. */
export async function ensureCsrfToken(req: Request): Promise<string> {
  if (!req.session.csrfToken) {
    req.session.csrfToken = newCsrfToken();
    await save(req);
  }
  return req.session.csrfToken;
}
