import { Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input, Select, Textarea } from "@/components/ui/field";
import { useCurrentUser } from "@/features/auth/auth";
import { useDebounced } from "@/lib/use-debounced";
import type { Chemical } from "@/types/api";
import { api } from "@/lib/api-client";
import { describeError } from "@/lib/errors";
import { Availability, StockDetail } from "./availability";
import { useChemicals } from "./chemicals-api";

function CreateChemicalForm() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: (body: unknown) => api("/chemicals", { method: "POST", body }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["chemicals"] }); },
    onError: (e) => setError(describeError(e)),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    create.mutate({
      chemicalCode: values.get("chemicalCode"), name: values.get("name"), category: values.get("category") || undefined,
      storageLocation: values.get("storageLocation") || undefined, hazardNotes: values.get("hazardNotes") || undefined,
      minimumStockAlert: Number(values.get("minimumStockAlert") || 0),
      packSizes: [{ label: values.get("packLabel"), unitType: values.get("unitType"), baseQuantity: Number(values.get("baseQuantity")) }],
    }, { onSuccess: () => form.reset() });
  };
  return <Card className="mb-5"><CardBody><h2 className="mb-3 font-semibold">Add chemical and pack size</h2>{error && <Alert className="mb-3" tone="bad">{error}</Alert>}<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Input name="chemicalCode" required minLength={2} maxLength={40} placeholder="Chemical code" aria-label="Chemical code" />
    <Input name="name" required minLength={2} maxLength={200} placeholder="Chemical name" aria-label="Chemical name" />
    <Input name="category" placeholder="Category" aria-label="Category" />
    <Input name="storageLocation" placeholder="Storage location" aria-label="Storage location" />
    <Input name="packLabel" required placeholder="Pack label (e.g. 500 ml)" aria-label="Pack label" />
    <Select name="unitType" aria-label="Pack unit type"><option value="MASS">Mass</option><option value="VOLUME">Volume</option><option value="COUNT">Count</option></Select>
    <Input name="baseQuantity" required type="number" min="0.001" step="0.001" placeholder="Base quantity" aria-label="Base quantity" />
    <Input name="minimumStockAlert" type="number" min="0" step="1" defaultValue="0" placeholder="Minimum stock alert" aria-label="Minimum stock alert" />
    <Textarea name="hazardNotes" maxLength={2000} placeholder="Hazard notes" aria-label="Hazard notes" className="sm:col-span-2" />
    <Button loading={create.isPending}>Create chemical</Button>
  </form></CardBody></Card>;
}

function ChemicalAdminToggle({ chemical }: { chemical: Chemical }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api(`/chemicals/${chemical.id}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["chemicals"] }); },
    onError: (e) => setError(describeError(e)),
  });
  return <div>{error && <p role="alert" className="text-xs text-bad-700">{error}</p>}<Button size="sm" variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate(!chemical.isActive)}>{chemical.isActive ? "Deactivate" : "Reactivate"}</Button></div>;
}

function PackAdminToggle({ chemicalId, packId, active }: { chemicalId: string; packId: string; active: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api(`/chemicals/${chemicalId}/pack-sizes/${packId}`, { method: "PATCH", body: { isActive } }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["chemicals"] }); },
    onError: (e) => setError(describeError(e)),
  });
  return <span className="ml-2 inline-flex items-center gap-1">{error && <span role="alert" className="text-xs text-bad-700">{error}</span>}<button type="button" className="text-xs text-brand-700 underline" disabled={toggle.isPending} onClick={() => toggle.mutate(!active)}>{active ? "Deactivate" : "Reactivate"}</button></span>;
}

export function ChemicalCard({ chemical, canManage = false }: { chemical: Chemical; canManage?: boolean }) {
  return (
    <li className="space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{chemical.name}</p>
          <p className="text-xs text-muted">
            <span className="font-mono">{chemical.chemicalCode}</span>
            {chemical.storageLocation && ` · Rack ${chemical.storageLocation}`}
            {chemical.category && ` · ${chemical.category}`}
          </p>
        </div>
        <div className="flex items-center gap-2">{!chemical.isActive && <Badge tone="neutral">Inactive</Badge>}{canManage && <ChemicalAdminToggle chemical={chemical} />}</div>
      </div>
      {chemical.hazardNotes && <p className="text-xs text-warn-700">Hazard notes: {chemical.hazardNotes}</p>}
      {chemical.packSizes.length === 0 ? (
        <p className="text-sm text-muted">No pack sizes defined.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {chemical.packSizes.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
            >
              <span className="text-sm font-medium">
                {p.label}
                {!p.isActive && <span className="ml-1 text-xs text-muted">(inactive)</span>}
                {canManage && <PackAdminToggle chemicalId={chemical.id} packId={p.id} active={p.isActive} />}
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <Availability balance={p.balance} />
                <StockDetail balance={p.balance} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ChemicalsPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const q = useDebounced(text.trim(), 300);
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const query = useChemicals({ q: q || undefined, page, pageSize: 10 });

  return (
    <>
      <PageHeader
        title="Chemicals"
        description={
          user.role === "EMPLOYEE"
            ? "Search the chemical store. Quantities are whole packs of each pack size."
            : "Stock by chemical and pack size. Mass and volume pack sizes are never converted or added together."
        }
        actions={user.role === "EMPLOYEE" &&
          <Link to="/requests/new">
            <Button>New request</Button>
          </Link>
        }
      />
      {user.role === "ADMIN" && <CreateChemicalForm />}
      <Card>
        <div className="border-b border-line p-4">
          <label htmlFor="chem-search" className="sr-only">
            Search by code, name or rack
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="chem-search"
              type="search"
              placeholder="Search by code, name or rack…"
              className="pl-10"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParams((p) => {
                  p.delete("page");
                  return p;
                });
              }}
            />
          </div>
        </div>

        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : query.data.data.length === 0 ? (
          <EmptyState title={q ? "No chemicals match your search" : "No chemicals available yet"}>
            {q
              ? "Try a different code, name or rack number."
              : "An administrator needs to add chemicals to the store."}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-line" aria-busy={query.isFetching}>
              {query.data.data.map((c) => (
                <ChemicalCard key={c.id} chemical={c} canManage={user.role === "ADMIN"} />
              ))}
            </ul>
            <Pagination
              meta={query.data.meta}
              onPage={(next) =>
                setParams((p) => {
                  p.set("page", String(next));
                  return p;
                })
              }
            />
          </>
        )}
      </Card>
    </>
  );
}
