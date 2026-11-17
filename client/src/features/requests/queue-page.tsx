import { Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { useDebounced } from "@/lib/use-debounced";
import { RequestList } from "./request-list";
import { useRequests } from "./requests-api";

export interface QueueFilter {
  label: string;
  /** Comma-separated statuses sent to GET /requests?status= */
  value: string;
}

/** Shared by the administrator review queue and the storekeeper issue desk. */
export function QueuePage({
  title,
  description,
  filters,
  emptyTitle,
  emptyText,
}: {
  title: string;
  description: string;
  filters: QueueFilter[];
  emptyTitle: string;
  emptyText: string;
}) {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? filters[0]?.value ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const query = useRequests({ status, q: q || undefined, page, pageSize: 15 });

  const update = (fn: (p: URLSearchParams) => void) =>
    setParams((p) => {
      fn(p);
      return p;
    });

  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <div className="relative min-w-52 flex-1">
            <label htmlFor="queue-search" className="sr-only">
              Search by request number
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              id="queue-search"
              type="search"
              className="pl-10"
              placeholder="Request number, e.g. REQ-2026-000012"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                update((p) => p.delete("page"));
              }}
            />
          </div>
          <div>
            <label htmlFor="queue-status" className="sr-only">
              Show
            </label>
            <Select
              id="queue-status"
              value={status}
              onChange={(e) =>
                update((p) => {
                  p.set("status", e.target.value);
                  p.delete("page");
                })
              }
            >
              {filters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : query.data.data.length === 0 ? (
          <EmptyState title={q ? "No requests match your search" : emptyTitle}>
            {q ? "Check the request number and the filter above." : emptyText}
          </EmptyState>
        ) : (
          <>
            <div aria-busy={query.isFetching}>
              <RequestList items={query.data.data} showRequester />
            </div>
            <Pagination
              meta={query.data.meta}
              onPage={(next) => update((p) => p.set("page", String(next)))}
            />
          </>
        )}
      </Card>
    </>
  );
}
