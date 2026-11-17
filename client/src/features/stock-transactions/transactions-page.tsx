import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams, Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/auth";
import { api, get } from "@/lib/api-client";
import { describeError } from "@/lib/errors";
import type { Paged, StockTransaction, TransactionType } from "@/types/api";

const types: (TransactionType | "")[] = [
  "",
  "RECEIPT",
  "ISSUE",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "REVERSAL",
];

function ReverseControl({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reverse = useMutation({
    mutationFn: () =>
      api(`/stock-transactions/${transactionId}/reverse`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      setReason("");
      setError("");
      onDone();
    },
    onError: (e) => setError(describeError(e)),
  });
  return (
    <details>
      <summary className="cursor-pointer text-xs text-brand-700">Reverse</summary>
      <form
        className="mt-2 flex min-w-64 gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          reverse.mutate();
        }}
      >
        <Input
          aria-label="Reversal reason"
          minLength={10}
          maxLength={500}
          required
          placeholder="Reason (10+ characters)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button size="sm" loading={reverse.isPending}>
          Confirm
        </Button>
      </form>
      {error && (
        <Alert className="mt-2" tone="bad">
          {error}
        </Alert>
      )}
    </details>
  );
}

export function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const type = (params.get("type") ?? "") as TransactionType | "";
  const query = useQuery({
    queryKey: ["stock-transactions", { page, type }],
    queryFn: ({ signal }) =>
      get<Paged<StockTransaction>>(
        "/stock-transactions",
        { page, pageSize: 20, type: type || undefined },
        signal,
      ),
  });
  return (
    <>
      <PageHeader
        title="Stock transactions"
        description="Append-only stock receipts, issues, adjustments and reversals."
      />
      <Card>
        <div className="border-b border-line p-4">
          <label className="sr-only" htmlFor="transaction-type">
            Transaction type
          </label>
          <Select
            id="transaction-type"
            className="max-w-xs"
            value={types.includes(type) ? type : ""}
            onChange={(e) => {
              setParams((current) => {
                if (e.target.value) current.set("type", e.target.value);
                else current.delete("type");
                return current;
              });
              setPage(1);
            }}
          >
            {types.map((v) => (
              <option value={v} key={v}>
                {v ? v.replaceAll("_", " ") : "All transaction types"}
              </option>
            ))}
          </Select>
        </div>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : query.data.data.length === 0 ? (
          <EmptyState title="No stock transactions">
            Recorded receipts and physical issues will appear here.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-canvas text-xs uppercase text-muted">
                  <tr>
                    {[
                      "Date",
                      "Type",
                      "Direction",
                      "Quantity",
                      "Chemical",
                      "Pack size",
                      "Performed by",
                      "Request / reason",
                      ...(me.role === "ADMIN" ? ["Correction"] : []),
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {query.data.data.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">{t.transactionType.replaceAll("_", " ")}</td>
                      <td className="px-4 py-3">{t.direction}</td>
                      <td className="px-4 py-3 tabular-nums">{t.quantity}</td>
                      <td className="px-4 py-3">
                        {t.chemical.name}
                        <span className="block text-xs text-muted">{t.chemical.chemicalCode}</span>
                      </td>
                      <td className="px-4 py-3">{t.packSize.label}</td>
                      <td className="px-4 py-3">{t.performedBy.fullName}</td>
                      <td className="max-w-64 px-4 py-3">
                        {t.requestId ? (
                          <Link className="text-brand-700 hover:underline" to={`/requests/${t.requestId}`}>
                            {t.requestId.slice(0, 8)}
                          </Link>
                        ) : (
                          (t.reason ?? "—")
                        )}
                      </td>
                      {me.role === "ADMIN" && (
                        <td className="px-4 py-3">
                          {["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"].includes(t.transactionType) &&
                          !t.reversalOfId &&
                          !t.reversedById ? (
                            <ReverseControl
                              transactionId={t.id}
                              onDone={() => {
                                void qc.invalidateQueries({ queryKey: ["stock-transactions"] });
                                void qc.invalidateQueries({ queryKey: ["inventory"] });
                                void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
                                void qc.invalidateQueries({ queryKey: ["reports"] });
                              }}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={query.data.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
