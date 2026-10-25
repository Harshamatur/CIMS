export type Role = "EMPLOYEE" | "ADMIN" | "STOREKEEPER";

export const ACTIONS = {
  "users:manage": ["ADMIN"],
  "chemicals:manage": ["ADMIN"],
  "inventory:view-detail": ["ADMIN", "STOREKEEPER"],
  "stock:receipt": ["ADMIN", "STOREKEEPER"],
  "stock:adjust": ["ADMIN"],
  "stock:reverse": ["ADMIN"],
  "stock:read": ["ADMIN", "STOREKEEPER"],
  "requests:review": ["ADMIN"],
  "requests:cancel-any": ["ADMIN"],
  "reports:inventory": ["ADMIN", "STOREKEEPER"],
  "reports:requests": ["ADMIN"],
  "audit:read": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;
export type Action = keyof typeof ACTIONS;

export const can = (role: Role, action: Action): boolean =>
  (ACTIONS[action] as readonly Role[]).includes(role);
export const rolesFor = (action: Action): Role[] => [...ACTIONS[action]];

/** Physical issue: STOREKEEPER only, unless explicitly configured to also allow ADMIN. */
export const issueRoles = (allowAdminIssue: boolean): Role[] =>
  allowAdminIssue ? ["STOREKEEPER", "ADMIN"] : ["STOREKEEPER"];

export interface Actor {
  id: string;
  role: Role;
}

const STOREKEEPER_VISIBLE = ["APPROVED", "PARTIALLY_ISSUED", "ISSUED"] as const;

/**
 * Object-level visibility for chemical requests (returned as a Prisma `where` fragment).
 * - EMPLOYEE: only their own requests (all statuses).
 * - ADMIN: every non-draft request plus their own drafts. Other people's drafts stay private.
 * - STOREKEEPER: approved / partially issued / issued requests plus their own.
 */
export function requestVisibilityWhere(actor: Actor): Record<string, unknown> {
  switch (actor.role) {
    case "EMPLOYEE":
      return { requestedBy: actor.id };
    case "ADMIN":
      return { OR: [{ requestedBy: actor.id }, { status: { not: "DRAFT" } }] };
    case "STOREKEEPER":
      return { OR: [{ requestedBy: actor.id }, { status: { in: [...STOREKEEPER_VISIBLE] } }] };
  }
}

export function canViewRequest(actor: Actor, request: { requestedBy: string; status: string }): boolean {
  if (request.requestedBy === actor.id) return true;
  if (actor.role === "ADMIN") return request.status !== "DRAFT";
  if (actor.role === "STOREKEEPER")
    return (STOREKEEPER_VISIBLE as readonly string[]).includes(request.status);
  return false;
}
