import { Link } from "react-router";
import { StatusBadge } from "@/components/data-display/status-badge";
import { formatDateTime } from "@/lib/utils";
import type { RequestSummary } from "@/types/api";

/** Table on wide screens, stacked cards on narrow ones (same data, no horizontal page scroll). */
export function RequestList({
  items,
  showRequester = false,
}: {
  items: RequestSummary[];
  showRequester?: boolean;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Chemical requests</caption>
          <thead className="border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Request
              </th>
              {showRequester && (
                <th scope="col" className="px-4 py-2.5">
                  Requested by
                </th>
              )}
              <th scope="col" className="px-4 py-2.5">
                Purpose
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Items
              </th>
              <th scope="col" className="px-4 py-2.5">
                Submitted
              </th>
              <th scope="col" className="px-4 py-2.5">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/50">
                <td className="px-4 py-3 font-medium">
                  <Link
                    to={`/requests/${r.id}`}
                    className="text-brand-700 underline-offset-2 hover:underline"
                  >
                    {r.requestNumber ?? "Draft"}
                  </Link>
                </td>
                {showRequester && (
                  <td className="px-4 py-3">
                    {r.requester.fullName}
                    <span className="block text-xs text-muted">{r.requester.employeeCode}</span>
                  </td>
                )}
                <td className="max-w-xs truncate px-4 py-3" title={r.purpose}>
                  {r.purpose}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.itemCount}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(r.submittedAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="block space-y-1.5 px-4 py-3 hover:bg-brand-50/50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-brand-700">{r.requestNumber ?? "Draft"}</span>
                <StatusBadge status={r.status} />
              </div>
              <p className="line-clamp-2 text-sm">{r.purpose}</p>
              <p className="text-xs text-muted">
                {showRequester && `${r.requester.fullName} · `}
                {r.itemCount} {r.itemCount === 1 ? "item" : "items"} · {formatDateTime(r.submittedAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
