import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useCurrentUser } from "@/features/auth/auth";
import { STATUS_META } from "@/components/data-display/status-badge";
import { buildUrl, get } from "@/lib/api-client";
import type { Paged, RequestStatus, RequestSummary, StockTransaction } from "@/types/api";

interface RequestReport extends Paged<RequestSummary> {
  statusCounts: Record<string, number>;
}

export function ReportsPage() {
  const user = useCurrentUser();
  const [status, setStatus] = useState<RequestStatus | "">("");
  const inventory = useQuery({
    queryKey: ["reports", "inventory"],
    queryFn: ({ signal }) =>
      get<
        Paged<{
          id: string;
          chemicalName: string;
          chemicalCode: string;
          packLabel: string;
          onHandQuantity: number;
          availableQuantity: number;
          minimumQuantity: number;
          lowStock: boolean;
        }>
      >("/reports/inventory", { page: 1, pageSize: 20 }, signal),
  });
  const lowStock = useQuery({
    queryKey: ["reports", "low-stock"],
    queryFn: ({ signal }) =>
      get<
        Paged<{
          id: string;
          chemicalName: string;
          chemicalCode: string;
          packLabel: string;
          availableQuantity: number;
          minimumQuantity: number;
        }>
      >("/reports/low-stock", { page: 1, pageSize: 20 }, signal),
  });
  const requestReport = useQuery({
    queryKey: ["reports", "requests", status],
    enabled: user.role === "ADMIN",
    queryFn: ({ signal }) =>
      get<RequestReport>("/reports/requests", { page: 1, pageSize: 10, status: status || undefined }, signal),
  });
  const transactions = useQuery({
    queryKey: ["reports", "stock-today"],
    queryFn: ({ signal }) =>
      get<Paged<StockTransaction>>("/reports/stock-transactions", { page: 1, pageSize: 10 }, signal),
  });
  const download = (path: string, filename: string, filters: Record<string, string | undefined> = {}) => (
    <a
      className="inline-flex min-h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-medium hover:bg-canvas"
      href={buildUrl(path, { format: "csv", ...filters })}
      download={filename}
    >
      Download CSV
    </a>
  );
  return (
    <>
      <PageHeader
        title="Reports"
        description="Review current operational data and download filtered CSV reports."
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
            {download("/reports/inventory", "inventory.csv")}
          </CardHeader>
          {inventory.isPending ? (
            <ListSkeleton rows={3} />
          ) : inventory.isError ? (
            <div className="p-4">
              <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
            </div>
          ) : !inventory.data.data.length ? (
            <EmptyState title="No inventory data" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="bg-canvas text-xs text-muted">
                  <tr>
                    <th className="p-3">Chemical / pack</th>
                    <th className="p-3">On hand</th>
                    <th className="p-3">Available</th>
                    <th className="p-3">Minimum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {inventory.data.data.map((row) => (
                    <tr key={row.id} className={row.lowStock ? "bg-warn-50/40" : ""}>
                      <td className="p-3">
                        {row.chemicalName} <span className="text-muted">· {row.packLabel}</span>
                      </td>
                      <td className="p-3">{row.onHandQuantity}</td>
                      <td className="p-3">{row.availableQuantity}</td>
                      <td className="p-3">{row.minimumQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card id="low-stock">
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
            {download("/reports/low-stock", "low-stock.csv")}
          </CardHeader>
          {lowStock.isPending ? (
            <ListSkeleton rows={2} />
          ) : lowStock.isError ? (
            <div className="p-4">
              <ErrorState error={lowStock.error} onRetry={() => void lowStock.refetch()} />
            </div>
          ) : !lowStock.data.data.length ? (
            <EmptyState title="No low-stock balances" />
          ) : (
            <ul className="divide-y divide-line">
              {lowStock.data.data.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {r.chemicalName}
                    <span className="block text-xs text-muted">
                      {r.chemicalCode} · {r.packLabel}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    {r.availableQuantity} / {r.minimumQuantity}
                    <span className="block text-xs text-muted">available / minimum</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stock transactions</CardTitle>
            {download("/reports/stock-transactions", "stock-transactions.csv")}
          </CardHeader>
          {transactions.isPending ? (
            <ListSkeleton rows={3} />
          ) : transactions.isError ? (
            <div className="p-4">
              <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
            </div>
          ) : !transactions.data.data.length ? (
            <EmptyState title="No stock transactions" />
          ) : (
            <ul className="divide-y divide-line">
              {transactions.data.data.slice(0, 6).map((t) => (
                <li key={t.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {t.transactionType.replaceAll("_", " ")} · {t.chemical.name} ({t.quantity} packs)
                  </span>
                  <time className="whitespace-nowrap text-xs text-muted">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {user.role === "ADMIN" && (
          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
              {download("/reports/requests", "requests.csv", { status: status || undefined })}
            </CardHeader>
            <div className="border-b border-line p-4">
              <label htmlFor="report-status" className="sr-only">
                Filter requests by status
              </label>
              <Select
                id="report-status"
                className="max-w-xs"
                value={status}
                onChange={(e) => setStatus(e.target.value as RequestStatus | "")}
              >
                <option value="">All statuses</option>
                {Object.entries(STATUS_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </Select>
            </div>
            {requestReport.isPending ? (
              <ListSkeleton rows={3} />
            ) : requestReport.isError ? (
              <div className="p-4">
                <ErrorState error={requestReport.error} onRetry={() => void requestReport.refetch()} />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 p-4">
                  {Object.entries(requestReport.data.statusCounts).map(([key, n]) => (
                    <span key={key} className="rounded-full bg-canvas px-3 py-1 text-xs">
                      {STATUS_META[key as RequestStatus]?.label ?? key}: {n}
                    </span>
                  ))}
                </div>
                {!requestReport.data.data.length ? (
                  <EmptyState title="No matching requests" />
                ) : (
                  <ul className="divide-y divide-line">
                    {requestReport.data.data.map((r) => (
                      <li key={r.id} className="px-4 py-3 text-sm">
                        <Link className="font-medium text-brand-700 hover:underline" to={`/requests/${r.id}`}>
                          {r.requestNumber ?? r.id}
                        </Link>
                        <span className="ml-2 text-muted">
                          {r.status} · {r.requester.fullName}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        )}
      </section>
    </>
  );
}
