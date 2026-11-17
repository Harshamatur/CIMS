import { zodResolver } from "@hookform/resolvers/zod";
import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { describeError } from "@/lib/errors";
import { consumeSessionExpired, useLogin, useSession } from "./auth";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your employee code or work email"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [expired, setExpired] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  useEffect(() => {
    if (consumeSessionExpired()) setExpired(true);
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (session.data) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit((values) => {
    setExpired(false);
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) });
  });

  return (
    <div className="grid min-h-dvh place-items-center bg-navy-900 px-4 py-8">
      <main className="w-full max-w-sm rounded-card bg-surface p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-md bg-navy-900 text-white">
            <FlaskConical className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">CIMS</h1>
            <p className="text-xs text-muted">Chemical Inventory and Issue Management</p>
          </div>
        </div>

        {expired && (
          <Alert tone="warn" className="mb-4" title="Session ended">
            Please sign in again to continue.
          </Alert>
        )}
        {login.isError && (
          <Alert tone="bad" className="mb-4" title="Sign-in failed">
            {describeError(login.error)}
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Employee code or work email" error={form.formState.errors.identifier?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                autoComplete="username"
                autoFocus
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register("identifier")}
              />
            )}
          </Field>
          <Field label="Password" error={form.formState.errors.password?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register("password")}
              />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={login.isPending}>
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">
          {/* Prototype for demonstration. Not an officially approved system. */}
        </p>
      </main>
    </div>
  );
}
