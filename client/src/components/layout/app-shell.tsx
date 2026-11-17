import { FlaskConical, LogOut, Menu, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCurrentUser, useLogout } from "@/features/auth/auth";
import { describeError } from "@/lib/errors";
import { navFor } from "./nav";

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const ROLE_LABEL = { EMPLOYEE: "Employee", ADMIN: "Administrator", STOREKEEPER: "Storekeeper" } as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  return (
    <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-4">
      {navFor(user.role).map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/85 hover:bg-white/10",
              isActive && "bg-white/15 text-white",
            )
          }
        >
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="grid size-10 place-items-center rounded-md bg-white/10">
        <FlaskConical className="size-6" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="text-base font-semibold">CIMS</p>
        <p className="text-[11px] text-white/65">Chemistry Division · prototype</p>
      </div>
    </div>
  );
}

function UserBox() {
  const user = useCurrentUser();
  const logout = useLogout();
  return (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium">{user.fullName}</p>
      <p className="mb-3 truncate text-xs text-white/65">
        {user.employeeCode} · {ROLE_LABEL[user.role]}
      </p>
      {logout.isError && (
        <p role="alert" className="mb-3 text-sm text-red-200">
          Sign out failed: {describeError(logout.error)}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-white hover:bg-white/10"
        onClick={() => logout.mutate()}
        loading={logout.isPending}
      >
        <LogOut className="size-4" aria-hidden="true" /> Sign out
      </Button>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-navy-900 text-white lg:flex">
        <Brand />
        <NavList />
        <UserBox />
      </aside>

      <header
        className="sticky top-0 z-30 flex items-center gap-2 bg-navy-900 px-2 py-2 text-white lg:hidden"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-6" aria-hidden="true" />
        </Button>
        <span className="text-base font-semibold">CIMS</span>
      </header>
      <Drawer open={open} onOpenChange={setOpen} title="Navigation">
        <Brand />
        <NavList onNavigate={() => setOpen(false)} />
        <UserBox />
      </Drawer>

      {!online && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-warn-50 px-3 py-2 text-sm font-medium text-warn-700"
        >
          <WifiOff className="size-4" aria-hidden="true" />
          You are offline. Actions that need the server are unavailable until the connection returns.
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function RoleBadge({ role }: { role: keyof typeof ROLE_LABEL }) {
  return <Badge tone="info">{ROLE_LABEL[role]}</Badge>;
}
