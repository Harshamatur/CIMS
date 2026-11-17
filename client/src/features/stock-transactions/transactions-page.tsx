import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { get } from "@/lib/api-client";
import type { Paged, StockTransaction, TransactionType } from "@/types/api";

const types: (TransactionType | "")[] = ["", "RECEIPT", "ISSUE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "REVERSAL"];

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TransactionType | "">("");
  const query = useQuery({
    queryKey: ["stock-transactions", { page, type }],
    queryFn: ({ signal }) => get<Paged<StockTransaction>>("/stock-transactions", { page, pageSize: 20, type: type || undefined }, signal),
  });
  return <>
    <PageHeader title="Stock transactions" description="Append-only stock receipts, issues, adjustments and reversals." />
    <Card>
      <div className="border-b border-line p-4"><label className="sr-only" htmlFor="transaction-type">Transaction type</label><Select id="transaction-type" className="max-w-xs" value={type} onChange={(e) => { setType(e.target.value as TransactionType | ""); setPage(1); }}>{types.map((v) => <option value={v} key={v}>{v ? v.replaceAll("_", " ") : "All transaction types"}</option>)}</Select></div>
      {query.isPending ? <ListSkeleton /> : query.isError ? <div className="p-4"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div> : query.data.data.length === 0 ? <EmptyState title="No stock transactions">Recorded receipts and physical issues will appear here.</EmptyState> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-canvas text-xs uppercase text-muted"><tr>{["Date", "Type", "Direction", "Quantity", "Chemical", "Pack size", "Performed by", "Request / reason"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">{query.data.data.map((t) => <tr key={t.id}><td className="whitespace-nowrap px-4 py-3">{new Date(t.createdAt).toLocaleString()}</td><td className="px-4 py-3">{t.transactionType.replaceAll("_", " ")}</td><td className="px-4 py-3">{t.direction}</td><td className="px-4 py-3 tabular-nums">{t.quantity}</td><td className="px-4 py-3">{t.chemical.name}<span className="block text-xs text-muted">{t.chemical.chemicalCode}</span></td><td className="px-4 py-3">{t.packSize.label}</td><td className="px-4 py-3">{t.performedBy.fullName}</td><td className="max-w-64 px-4 py-3">{t.requestId ? <a className="text-brand-700 hover:underline" href={`/requests/${t.requestId}`}>{t.requestId.slice(0, 8)}</a> : t.reason ?? "—"}</td></tr>)}</tbody></table></div>
        <Pagination meta={query.data.meta} onPage={setPage} />
      </>}
    </Card>
  </>;
}
