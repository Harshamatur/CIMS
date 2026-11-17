import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useCurrentUser } from "@/features/auth/auth";
import { get, api } from "@/lib/api-client";
import { describeError } from "@/lib/errors";
import type { Envelope, InventoryBalance, Paged } from "@/types/api";

function BalanceActions({ row }: { row: InventoryBalance }) {
  const qc = useQueryClient();
  const me = useCurrentUser();
  const [threshold, setThreshold] = useState(String(row.minimumQuantity));
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const saveThreshold = useMutation({
    mutationFn: () => api<Envelope<InventoryBalance>>(`/inventory/${row.packSizeId}/threshold`, { method: "PATCH", body: { minimumQuantity: Number(threshold) } }),
    onSuccess: () => { setError(""); void qc.invalidateQueries({ queryKey: ["inventory"] }); void qc.invalidateQueries({ queryKey: ["dashboard-summary"] }); },
    onError: (e) => setError(describeError(e)),
  });
  const movement = useMutation({
    mutationFn: (kind: "receipt" | "adjustment") => api(`/stock-transactions/${kind === "receipt" ? "receipts" : "adjustments"}`, {
      method: "POST", body: kind === "receipt"
        ? { chemicalId: row.chemicalId, packSizeId: row.packSizeId, quantity: Number(quantity), reason }
        : { chemicalId: row.chemicalId, packSizeId: row.packSizeId, quantity: Number(quantity), reason, direction: "IN" },
    }),
    onSuccess: () => {
      setError(""); setQuantity(""); setReason("");
      void qc.invalidateQueries({ queryKey: ["inventory"] }); void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void qc.invalidateQueries({ queryKey: ["stock-transactions"] });
    },
    onError: (e) => setError(describeError(e)),
  });
  const submitMovement = (event: FormEvent, kind: "receipt" | "adjustment") => {
    event.preventDefault();
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || reason.trim().length < (kind === "receipt" ? 3 : 10)) {
      setError(kind === "receipt" ? "Enter a positive whole-pack quantity and a reason of at least 3 characters." : "Enter a positive whole-pack quantity and an adjustment reason of at least 10 characters.");
      return;
    }
    movement.mutate(kind);
  };
  return <details className="min-w-64">
    <summary className="cursor-pointer text-sm font-medium text-brand-700">Manage balance</summary>
    <div className="mt-3 space-y-3 rounded-md bg-canvas p-3">
      {error && <Alert tone="bad">{error}</Alert>}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); saveThreshold.mutate(); }}>
        <label className="min-w-0 flex-1 text-xs font-medium">Low-stock threshold
          <Input className="mt-1" type="number" min="0" step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <Button size="sm" loading={saveThreshold.isPending}>Save</Button>
      </form>
      <form className="space-y-2" onSubmit={(e) => submitMovement(e, "receipt")}>
        <p className="text-xs font-semibold">Receive stock</p>
        <div className="flex gap-2"><Input aria-label="Receipt quantity in packs" type="number" min="1" step="1" placeholder="Packs" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Input aria-label="Receipt reference" placeholder="GRN / reference" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" loading={movement.isPending}>Receive</Button></div>
      </form>
      {me.role === "ADMIN" && <form className="space-y-2" onSubmit={(e) => submitMovement(e, "adjustment")}>
        <p className="text-xs font-semibold">Positive adjustment</p>
        <div className="flex gap-2"><Input aria-label="Adjustment quantity in packs" type="number" min="1" step="1" placeholder="Packs" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><Input aria-label="Adjustment reason" placeholder="Reason (10+ chars)" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" loading={movement.isPending}>Adjust</Button></div>
      </form>}
    </div>
  </details>;
}

export function InventoryPage() {
  const [page, setPage] = useState(1);
  const [lowOnly, setLowOnly] = useState(false);
  const query = useQuery({
    queryKey: ["inventory", { page, lowOnly }],
    queryFn: ({ signal }) => get<Paged<InventoryBalance>>("/inventory", { page, pageSize: 15, lowOnly }, signal),
  });
  return <>
    <PageHeader title="Inventory management" description="Review stock by chemical and pack size, maintain alert thresholds, and record stock movements." />
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); setPage(1); }} /> Show low-stock balances only</label>
        <p className="text-xs text-muted">Quantities are individual packs; different pack sizes are not combined.</p>
      </div>
      {query.isPending ? <ListSkeleton /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : query.data.data.length === 0 ? <EmptyState title="No inventory balances found">Add a chemical and pack size, then record a receipt to initialize stock.</EmptyState> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-canvas text-xs uppercase text-muted"><tr>{["Chemical", "Pack", "On hand", "Reserved", "Available", "Minimum", "Updated", "Actions"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{query.data.data.map((r) => <tr key={r.id} className={r.lowStock ? "bg-warn-50/40" : ""}><td className="px-4 py-3"><span className="font-medium">{r.chemicalName}</span><span className="block text-xs text-muted">{r.chemicalCode}{r.storageLocation ? ` · ${r.storageLocation}` : ""}</span></td><td className="px-4 py-3">{r.packLabel}</td><td className="px-4 py-3 tabular-nums">{r.onHandQuantity}</td><td className="px-4 py-3 tabular-nums">{r.reservedQuantity}</td><td className="px-4 py-3 tabular-nums">{r.availableQuantity}</td><td className="px-4 py-3 tabular-nums">{r.minimumQuantity}</td><td className="px-4 py-3">{new Date(r.updatedAt).toLocaleString()}</td><td className="px-4 py-3"><BalanceActions row={r} /></td></tr>)}</tbody></table></div>
        <Pagination meta={query.data.meta} onPage={setPage} />
      </>}
    </Card>
  </>;
}
