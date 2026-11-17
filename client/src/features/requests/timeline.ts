import type { RequestDetail } from "@/types/api";
import { packQuantity } from "@/lib/utils";

export type TimelineTone = "neutral" | "info" | "ok" | "bad" | "warn";
export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail?: string;
  actor?: string;
  tone: TimelineTone;
  /** True when the timestamp is the request's last-update time rather than a dedicated event record. */
  approximate?: boolean;
}

/**
 * Built ONLY from records the backend returns (request timestamps, approval actions, issue transactions).
 * Nothing is invented; cancellation has no dedicated record so it uses updatedAt and is flagged approximate.
 */
export function buildTimeline(request: RequestDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: "created",
      at: request.createdAt,
      title: "Draft created",
      actor: request.requester.fullName,
      tone: "neutral",
    },
  ];
  if (request.submittedAt) {
    events.push({
      id: "submitted",
      at: request.submittedAt,
      title: `Submitted${request.requestNumber ? ` as ${request.requestNumber}` : ""}`,
      detail: "Awaiting administrator review.",
      actor: request.requester.fullName,
      tone: "info",
    });
  }
  for (const a of request.approvalActions) {
    events.push({
      id: `decision-${a.id}`,
      at: a.createdAt,
      title: a.decision === "APPROVED" ? "Approved" : "Rejected",
      detail:
        a.decision === "APPROVED"
          ? (a.comments ??
            "Approved for issue. Approval does not mean the chemicals have been handed over yet.")
          : `Reason: ${a.comments ?? request.rejectionReason ?? "not recorded"}`,
      actor: a.reviewer.fullName,
      tone: a.decision === "APPROVED" ? "ok" : "bad",
    });
  }
  const itemById = new Map(request.items.map((i) => [i.id, i]));
  for (const issue of request.issues) {
    const item = itemById.get(issue.requestItemId);
    events.push({
      id: `issue-${issue.id}`,
      at: issue.createdAt,
      title: "Chemicals issued",
      detail: item
        ? `${item.chemical.name}: ${packQuantity(issue.quantity, item.packSize.label)}`
        : `${issue.quantity} pack(s)`,
      actor: issue.performedBy.fullName,
      tone: "ok",
    });
  }
  if (request.status === "CANCELLED") {
    events.push({
      id: "cancelled",
      at: request.updatedAt,
      title: "Cancelled",
      tone: "warn",
      approximate: true,
    });
  }
  return events.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());
}
