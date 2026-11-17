import { QueuePage } from "@/features/requests/queue-page";

export function IssueDeskPage() {
  return (
    <QueuePage
      title="Issue desk"
      description="Approved requests ready for physical hand-over. Open a request to record what was actually issued."
      filters={[
        { label: "Ready to issue", value: "APPROVED,PARTIALLY_ISSUED" },
        { label: "Approved, not yet issued", value: "APPROVED" },
        { label: "Partially issued", value: "PARTIALLY_ISSUED" },
        { label: "Fully issued", value: "ISSUED" },
      ]}
      emptyTitle="No approved requests to issue"
      emptyText="Requests appear here once an administrator approves them."
    />
  );
}
