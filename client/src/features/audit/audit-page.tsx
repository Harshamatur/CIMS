import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { get } from "@/lib/api-client";
import type { AuditEntry, Paged } from "@/types/api";

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [filter, setFilter] = useState("");
  const query = useQuery({
    queryKey: ["audit-logs", { page, filter }],
    queryFn: ({ signal }) =>
      get<Paged<AuditEntry>>("/audit-logs", { page, pageSize: 20, action: filter || undefined }, signal),
  });
  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Review recorded administrative decisions and system changes."
      />
      <Card>
        <form
          className="flex gap-2 border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter(action.trim());
            setPage(1);
          }}
        >
          <Input
            aria-label="Filter action"
            placeholder="Exact action, e.g. STOCK_ISSUED"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <button className="rounded-md bg-navy-900 px-4 text-sm font-medium text-white" type="submit">
            Filter
          </button>
        </form>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : !query.data.data.length ? (
          <EmptyState title="No audit entries found">Recorded changes will appear here.</EmptyState>
        ) : (
          <>
            <div className="divide-y divide-line">
              {query.data.data.map((entry) => (
                <details key={entry.id} className="px-4 py-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <time className="text-xs text-muted">{new Date(entry.createdAt).toLocaleString()}</time>
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-sm text-muted">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId}` : ""}
                    </span>
                    <span className="ml-auto text-xs text-muted">{entry.actor?.fullName ?? "System"}</span>
                  </summary>
                  <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold">Before</dt>
                      <dd className="mt-1 overflow-auto rounded bg-canvas p-2">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(entry.beforeData, null, 2) ?? "—"}
                        </pre>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">After</dt>
                      <dd className="mt-1 overflow-auto rounded bg-canvas p-2">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(entry.afterData, null, 2) ?? "—"}
                        </pre>
                      </dd>
                    </div>
                  </dl>
                </details>
              ))}
            </div>
            <Pagination meta={query.data.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
