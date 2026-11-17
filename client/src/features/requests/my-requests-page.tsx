import { Link, useSearchParams } from "react-router";
import { Pagination } from "@/components/data-display/pagination";
import { STATUS_META } from "@/components/data-display/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useCurrentUser } from "@/features/auth/auth";
import { REQUEST_STATUSES, type RequestStatus } from "@/types/api";
import { RequestList } from "./request-list";
import { useRequests } from "./requests-api";

export function MyRequestsPage() {
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  // requestedBy = me keeps this page personal even for administrators, who can otherwise see everyone's requests.
  const query = useRequests({ requestedBy: me.id, status: status || undefined, page, pageSize: 15 });
  const known = (REQUEST_STATUSES as readonly string[]).includes(status);

  return (
    <>
      <PageHeader
        title="My requests"
        description="Everything you have requested and where it stands."
        actions={
          <Link to="/requests/new">
            <Button>New request</Button>
          </Link>
        }
      />
      <Card>
        <div className="border-b border-line p-4">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <Select
            id="status-filter"
            className="max-w-xs"
            value={known ? status : ""}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set("status", e.target.value);
                else p.delete("status");
                p.delete("page");
                return p;
              })
            }
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s: RequestStatus) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
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
          <EmptyState
            title={status ? "No requests with this status" : "You have not made any requests yet"}
            action={
              !status && (
                <Link to="/requests/new">
                  <Button className="mt-2">Create your first request</Button>
                </Link>
              )
            }
          >
            {status
              ? "Try another status filter."
              : "Requests you submit will be listed here with their current status."}
          </EmptyState>
        ) : (
          <>
            <div aria-busy={query.isFetching}>
              <RequestList items={query.data.data} />
            </div>
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
