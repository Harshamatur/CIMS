import {
  ClipboardCheck,
  ClipboardList,
  ArrowLeftRight,
  Boxes,
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
  roles?: readonly Role[];
}

const ALL: NavItem[] = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/chemicals", label: "Chemicals", Icon: FlaskConical },
  { to: "/requests/new", label: "New request", Icon: FilePlus2, roles: ["EMPLOYEE"] },
  { to: "/requests", label: "My requests", Icon: ClipboardList, end: true, roles: ["EMPLOYEE"] },
  { to: "/review", label: "Review queue", Icon: ClipboardCheck, roles: ["ADMIN"] },
  { to: "/issue", label: "Issue desk", Icon: PackageCheck, roles: ["STOREKEEPER"] },
  { to: "/inventory", label: "Inventory management", Icon: Boxes, roles: ["ADMIN"] },
  { to: "/stock-transactions", label: "Stock transactions", Icon: ArrowLeftRight, roles: ["ADMIN", "STOREKEEPER"] },
  { to: "/users", label: "User management", Icon: Users, roles: ["ADMIN"] },
  { to: "/reports", label: "Reports", Icon: FileBarChart, roles: ["ADMIN", "STOREKEEPER"] },
  { to: "/audit-logs", label: "Audit logs", Icon: ScrollText, roles: ["ADMIN"] },
];

/** Navigation reflects the role for convenience only; the backend enforces every permission. */
export const navFor = (role: Role): NavItem[] => ALL.filter((i) => !i.roles || i.roles.includes(role));
