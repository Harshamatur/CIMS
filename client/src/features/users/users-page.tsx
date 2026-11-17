import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { get, api } from "@/lib/api-client";
import { describeError } from "@/lib/errors";
import type { Envelope, ManagedUser, Paged, Role, UserStatus } from "@/types/api";

const roles: Role[] = ["EMPLOYEE", "ADMIN", "STOREKEEPER"];
const statuses: UserStatus[] = ["ACTIVE", "INACTIVE", "LOCKED"];

function CreateUserForm() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Envelope<ManagedUser>>("/users", { method: "POST", body }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => setError(describeError(e)),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({ employeeCode: fd.get("employeeCode"), fullName: fd.get("fullName"), email: fd.get("email") || undefined, role: fd.get("role"), initialPassword: fd.get("initialPassword") });
    e.currentTarget.reset();
  };
  return <Card className="mb-5"><CardBody><h2 className="mb-3 font-semibold">Create user</h2>{error && <Alert className="mb-3" tone="bad">{error}</Alert>}<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    <Input name="employeeCode" required minLength={2} maxLength={32} placeholder="Employee code" aria-label="Employee code" />
    <Input name="fullName" required minLength={2} maxLength={150} placeholder="Full name" aria-label="Full name" />
    <Input name="email" type="email" placeholder="Email (optional)" aria-label="Email (optional)" />
    <Select name="role" aria-label="Role">{roles.map((r) => <option key={r}>{r}</option>)}</Select>
    <Input name="initialPassword" type="password" required minLength={12} placeholder="Initial password" aria-label="Initial password" />
    <Button className="sm:col-span-2 lg:col-span-5" loading={create.isPending}>Create account</Button>
  </form></CardBody></Card>;
}

function UserControls({ user }: { user: ManagedUser }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<Envelope<ManagedUser>>(`/users/${user.id}`, { method: "PATCH", body }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e) => { setError(describeError(e)); void qc.invalidateQueries({ queryKey: ["users"] }); },
  });
  const reset = useMutation({
    mutationFn: (newPassword: string) => api(`/users/${user.id}/reset-password`, { method: "POST", body: { newPassword } }),
    onSuccess: () => setError("Password reset. The user's sessions have been ended."),
    onError: (e) => setError(describeError(e)),
  });
  return <div className="min-w-64 space-y-2"><div className="flex gap-2"><Select aria-label={`Role for ${user.fullName}`} value={user.role} onChange={(e) => update.mutate({ role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</Select><Select aria-label={`Status for ${user.fullName}`} value={user.status} onChange={(e) => update.mutate({ status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</Select></div><details><summary className="cursor-pointer text-xs text-brand-700">Reset password</summary><form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); reset.mutate(String(fd.get("password"))); e.currentTarget.reset(); }}><Input name="password" type="password" required minLength={12} aria-label={`New password for ${user.fullName}`} placeholder="New password (12+ chars)"/><Button size="sm" loading={reset.isPending}>Set</Button></form></details>{error && <p role="status" className="max-w-64 text-xs text-muted">{error}</p>}</div>;
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<Role | "">("");
  const query = useQuery({ queryKey: ["users", { page, role }], queryFn: ({ signal }) => get<Paged<ManagedUser>>("/users", { page, pageSize: 15, role: role || undefined }, signal) });
  return <>
    <PageHeader title="User management" description="Provision accounts and manage user roles, access status and password resets." />
    <CreateUserForm />
    <Card><div className="border-b border-line p-4"><label htmlFor="users-role" className="sr-only">Filter users by role</label><Select id="users-role" className="max-w-xs" value={role} onChange={(e) => { setRole(e.target.value as Role | ""); setPage(1); }}><option value="">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</Select></div>
      {query.isPending ? <ListSkeleton /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : !query.data.data.length ? <EmptyState title="No users found">Create an account to grant access to CIMS.</EmptyState> : <><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-canvas text-xs uppercase text-muted"><tr>{["User", "Employee code", "Last login", "Role and access", ""].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{query.data.data.map((u) => <tr key={u.id}><td className="px-4 py-3 font-medium">{u.fullName}<span className="block text-xs text-muted">{u.email ?? "No email"}</span></td><td className="px-4 py-3">{u.employeeCode}</td><td className="px-4 py-3">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}</td><td className="px-4 py-3" colSpan={2}><UserControls user={u} /></td></tr>)}</tbody></table></div><Pagination meta={query.data.meta} onPage={setPage}/></>}
    </Card>
  </>;
}
