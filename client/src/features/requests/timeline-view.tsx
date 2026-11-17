import { cn, formatDateTime } from "@/lib/utils";
import { buildTimeline, type TimelineTone } from "./timeline";
import type { RequestDetail } from "@/types/api";

const DOT: Record<TimelineTone, string> = {
  neutral: "bg-muted",
  info: "bg-info-700",
  ok: "bg-ok-700",
  bad: "bg-bad-700",
  warn: "bg-warn-700",
};

export function TimelineView({ request }: { request: RequestDetail }) {
  const events = buildTimeline(request);
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5" aria-label="Request history">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              "absolute top-1.5 -left-[1.62rem] size-3 rounded-full ring-4 ring-surface",
              DOT[e.tone],
            )}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold">{e.title}</p>
          <p className="text-xs text-muted">
            {formatDateTime(e.at)}
            {e.approximate && " (approximate)"}
            {e.actor && ` · ${e.actor}`}
          </p>
          {e.detail && <p className="mt-0.5 text-sm break-words">{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
