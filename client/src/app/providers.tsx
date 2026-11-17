import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/feedback/toast";
import { ME_KEY, markSessionExpired } from "@/features/auth/auth";
import { setUnauthorizedHandler } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";

/** Any 401 from the API means the session ended: drop cached data and let the route guard redirect to /login. */
function SessionEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      markSessionExpired();
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      qc.setQueryData(ME_KEY, null);
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);
  return null;
}

export function Providers({
  children,
  client,
}: {
  children: ReactNode;
  client?: ReturnType<typeof createQueryClient>;
}) {
  const [qc] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <SessionEvents />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
