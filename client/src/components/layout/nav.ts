import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FilePlus2,
  FlaskConical,
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types/api";

export interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
  /** Display-only access metadata. Every endpoint independently checks the user's role. */
  roles: readonly Role[];
}

const NAV_BY_ROLE: Record<Role, readonly NavItem[]> = {
  EMPLOYEE: [
    { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true, roles: ["EMPLOYEE"] },
    { to: "/chemicals", label: "Chemicals", Icon: FlaskConical, roles: ["EMPLOYEE"] },
    { to: "/requests/new", label: "New request", Icon: FilePlus2, roles: ["EMPLOYEE"] },
    { to: "/requests", label: "My requests", Icon: ClipboardList, end: true, roles: ["EMPLOYEE"] },
  ],
  ADMIN: [
    { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true, roles: ["ADMIN"] },
    { to: "/review", label: "Review queue", Icon: ClipboardCheck, roles: ["ADMIN"] },
    { to: "/chemicals", label: "Chemicals", Icon: FlaskConical, roles: ["ADMIN"] },
    { to: "/inventory", label: "Inventory management", Icon: Boxes, roles: ["ADMIN"] },
    { to: "/stock-transactions", label: "Stock transactions", Icon: ArrowLeftRight, roles: ["ADMIN"] },
    { to: "/users", label: "User management", Icon: Users, roles: ["ADMIN"] },
    { to: "/reports", label: "Reports", Icon: FileBarChart, roles: ["ADMIN"] },
    { to: "/audit-logs", label: "Audit logs", Icon: ScrollText, roles: ["ADMIN"] },
  ],
  STOREKEEPER: [
    { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true, roles: ["STOREKEEPER"] },
    { to: "/issue", label: "Issue desk", Icon: PackageCheck, roles: ["STOREKEEPER"] },
    { to: "/chemicals", label: "Chemicals", Icon: FlaskConical, roles: ["STOREKEEPER"] },
    { to: "/stock-transactions", label: "Stock transactions", Icon: ArrowLeftRight, roles: ["STOREKEEPER"] },
    { to: "/reports", label: "Reports", Icon: FileBarChart, roles: ["STOREKEEPER"] },
  ],
};

const ADMIN_ISSUE: NavItem = { to: "/issue", label: "Issue desk", Icon: PackageCheck, roles: ["ADMIN"] };

/** Sidebar configuration only; the backend remains the permission authority. */
export const navFor = (role: Role, allowAdminIssue = false): readonly NavItem[] => {
  const items = NAV_BY_ROLE[role] ?? [];
  return role === "ADMIN" && allowAdminIssue ? [...items, ADMIN_ISSUE] : items;
};
