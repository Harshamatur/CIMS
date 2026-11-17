import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { newId } from "@/lib/utils";

interface Toast {
  id: string;
  tone: "ok" | "bad" | "info";
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = newId();
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("ok", m), error: (m) => push("bad", m) }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md flex-col gap-2"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto shadow-lg">
            <Alert tone={t.tone}>{t.message}</Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
