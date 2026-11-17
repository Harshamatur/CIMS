import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorState, FullPageLoading } from "@/components/feedback/states";
import { Alert } from "@/components/ui/alert";
import { UserProvider, useCurrentUser, useSession } from "@/features/auth/auth";
import type { Role } from "@/types/api";

/** Gate for every signed-in route. The session is always verified with the server, never inferred from local state. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <FullPageLoading />;
  if (session.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    );
  }
  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <UserProvider value={session.data}>
      <AppShell />
    </UserProvider>
  );
}

/** Hides pages a role should not use. This is a convenience: the backend independently returns 403. */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children?: ReactNode }) {
  const user = useCurrentUser();
  if (!roles.includes(user.role)) {
    return (
      <>
        <PageHeader title="Access restricted" />
        <Alert tone="warn" title="You do not have access to this page">
          Your role ({user.role.toLowerCase()}) cannot use this area. If you think this is a mistake, contact
          an administrator.
        </Alert>
      </>
    );
  }
  return children ?? <Outlet />;
}
