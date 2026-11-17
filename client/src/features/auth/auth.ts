import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api, ApiError, setCsrfToken } from "@/lib/api-client";
import type { Envelope, SessionCapabilities, SessionUser } from "@/types/api";

export const ME_KEY = ["me"] as const;

interface SessionPayload {
  user: SessionUser;
  csrfToken: string;
}

/** Returns the signed-in user, or null when there is no valid session (an expected answer, not an error). */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await api<Envelope<SessionPayload>>("/auth/me", { suppressUnauthorized: true });
    setCsrfToken(res.data.csrfToken);
    return res.data.user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export const useSession = () =>
  useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: false });

export const useSessionCapabilities = (enabled = true) =>
  useQuery({
    queryKey: ["session-capabilities"],
    queryFn: async () => (await api<Envelope<SessionCapabilities>>("/auth/capabilities")).data,
    enabled,
    staleTime: 60_000,
  });

// Set when any API call reports an expired session so the login page can explain why the user is back there.
let sessionExpired = false;
export const markSessionExpired = (): void => {
  sessionExpired = true;
};
export const consumeSessionExpired = (): boolean => {
  const was = sessionExpired;
  sessionExpired = false;
  return was;
};

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      // The CSRF token is fetched on demand by the API client before this POST.
      const res = await api<Envelope<SessionPayload>>("/auth/login", { method: "POST", body: input });
      setCsrfToken(res.data.csrfToken);
      return res.data.user;
    },
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(ME_KEY, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST", body: {} }),
    onSuccess: () => {
      setCsrfToken(null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      qc.setQueryData(ME_KEY, null);
    },
  });
}

const UserContext = createContext<SessionUser | null>(null);
export const UserProvider = UserContext.Provider;
export function useCurrentUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useCurrentUser must be used inside a signed-in route");
  return user;
}
