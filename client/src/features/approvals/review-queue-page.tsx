import { QueuePage } from "@/features/requests/queue-page";

export function ReviewQueuePage() {
  return (
    <QueuePage
      title="Review queue"
      description="Submitted requests waiting for a decision. Open a request to approve or reject it."
      filters={[
        { label: "Awaiting my decision", value: "SUBMITTED" },
        { label: "Approved, not yet issued", value: "APPROVED" },
        { label: "Partially issued", value: "PARTIALLY_ISSUED" },
        { label: "Fully issued", value: "ISSUED" },
        { label: "Rejected", value: "REJECTED" },
        { label: "Draft", value: "DRAFT" },
        { label: "Cancelled", value: "CANCELLED" },
        {
          label: "All requests in scope",
          value: "DRAFT,SUBMITTED,APPROVED,REJECTED,PARTIALLY_ISSUED,ISSUED,CANCELLED",
        },
      ]}
      emptyTitle="Nothing is waiting for review"
      emptyText="New submissions will appear here."
    />
  );
}
