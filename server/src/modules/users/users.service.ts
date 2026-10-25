import { conflict, forbidden, notFound } from "../../common/errors.js";
import { hashPassword } from "../../common/password.js";
import { pageMeta, skipTake, type PageQuery } from "../../common/pagination.js";
import { getSessionPool, getPrisma } from "../../db/client.js";
import { recordAudit, type ServiceContext } from "../audit/audit.service.js";
import type { Role } from "../../common/permissions.js";

/** Explicit allow-list: the password hash can never leak through a DTO. */
export const userSelect = {
  id: true,
  employeeCode: true,
  fullName: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED";

export async function listUsers(q: PageQuery & { q?: string; role?: Role; status?: UserStatus }) {
  const where = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { fullName: { contains: q.q, mode: "insensitive" as const } },
            { employeeCode: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const db = getPrisma();
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, select: userSelect, orderBy: { employeeCode: "asc" }, ...skipTake(q) }),
    db.user.count({ where }),
  ]);
  return { data: rows, meta: pageMeta(q, total) };
}

export async function getUser(id: string) {
  const user = await getPrisma().user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound("User");
  return user;
}

export async function createUser(
  ctx: ServiceContext,
  input: { employeeCode: string; fullName: string; email?: string; role: Role; initialPassword: string },
) {
  const passwordHash = await hashPassword(input.initialPassword);
  return getPrisma().$transaction(async (tx) => {
    const clash = await tx.user.findFirst({
      where: { OR: [{ employeeCode: input.employeeCode }, ...(input.email ? [{ email: input.email }] : [])] },
      select: { id: true },
    });
    if (clash)
      throw conflict("DUPLICATE_RESOURCE", "A user with this employee code or email already exists.");
    const user = await tx.user.create({
      data: {
        employeeCode: input.employeeCode,
        fullName: input.fullName,
        email: input.email ?? null,
        role: input.role,
        passwordHash,
      },
      select: userSelect,
    });
    await recordAudit(tx, ctx, {
      action: "USER_CREATED",
      entityType: "user",
      entityId: user.id,
      after: user,
    });
    return user;
  });
}

async function endSessionsOf(userId: string): Promise<void> {
  await getSessionPool().query(`DELETE FROM session WHERE (sess::jsonb ->> 'userId') = $1`, [userId]);
}

export async function updateUser(
  ctx: ServiceContext,
  id: string,
  patch: { fullName?: string; email?: string | null; role?: Role; status?: UserStatus },
) {
  if (
    id === ctx.actorId &&
    (patch.role !== undefined || (patch.status !== undefined && patch.status !== "ACTIVE"))
  ) {
    throw forbidden("You cannot change your own role or deactivate your own account.");
  }
  const updated = await getPrisma().$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: userSelect });
    if (!before) throw notFound("User");
    if (patch.email) {
      const clash = await tx.user.findFirst({
        where: { email: patch.email, NOT: { id } },
        select: { id: true },
      });
      if (clash) throw conflict("DUPLICATE_RESOURCE", "Another user already has this email.");
    }
    const after = await tx.user.update({ where: { id }, data: patch, select: userSelect });
    await recordAudit(tx, ctx, {
      action: patch.status && patch.status !== before.status ? "USER_STATUS_CHANGED" : "USER_UPDATED",
      entityType: "user",
      entityId: id,
      before,
      after,
    });
    return after;
  });
  if (updated.status !== "ACTIVE" || patch.role !== undefined) await endSessionsOf(id);
  return updated;
}

export async function resetPassword(ctx: ServiceContext, id: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await getPrisma().$transaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("User");
    await tx.user.update({ where: { id }, data: { passwordHash } });
    // The hash itself is never written to the audit log.
    await recordAudit(tx, ctx, { action: "USER_PASSWORD_RESET", entityType: "user", entityId: id });
  });
  await endSessionsOf(id);
}
