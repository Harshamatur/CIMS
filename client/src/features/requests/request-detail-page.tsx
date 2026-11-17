import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { StatusBadge, STATUS_META } from "@/components/data-display/status-badge";
import { ErrorState, ListSkeleton } from "@/components/feedback/states";
import { useToast } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/dialog";
import { ReviewPanel } from "@/features/approvals/review-panel";
import { useCurrentUser } from "@/features/auth/auth";
import { IssuePanel } from "@/features/stock-issues/issue-panel";
import { ApiError } from "@/lib/api-client";
import { describeError, isStaleStateError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import type { RequestDetail } from "@/types/api";
import { invalidateRequestData, invalidateRequestLists, requestsApi, useRequest } from "./requests-api";
import { TimelineView } from "./timeline-view";

function ItemsList({ request }: { request: RequestDetail }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Requested chemicals</caption>
          <thead className="border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Chemical
              </th>
              <th scope="col" className="px-4 py-2.5">
                Pack size
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Requested
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Approved
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Issued
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Remaining
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {request.items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{i.chemical.name}</span>
                  <span className="block font-mono text-xs text-muted">
                    {i.chemical.chemicalCode}
                    {i.chemical.storageLocation && ` · Rack ${i.chemical.storageLocation}`}
                  </span>
                </td>
                <td className="px-4 py-3">{i.packSize.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{i.requestedQuantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">{i.approvedQuantity ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{i.issuedQuantity}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {i.approvedQuantity === null ? "—" : i.remainingToIssue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {request.items.map((i) => (
          <li key={i.id} className="space-y-1 px-4 py-3 text-sm">
            <p className="font-medium">
              {i.chemical.name} <span className="text-muted">· {i.packSize.label}</span>
            </p>
            <p className="text-xs text-muted">
              Requested {i.requestedQuantity} · approved {i.approvedQuantity ?? "—"} · issued{" "}
              {i.issuedQuantity}
              {i.approvedQuantity !== null && ` · remaining ${i.remainingToIssue}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function OwnerActions({ request }: { request: RequestDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => invalidateRequestData(qc, request.id);

  const submit = useMutation({
    mutationFn: () => requestsApi.submit(request.id),
    onSuccess: (updated) => {
      qc.setQueryData(["request", updated.id], updated);
      toast.success("Request submitted for review.");
      void invalidateRequestLists(qc);
    },
    onError: (e) => isStaleStateError(e) && void refresh(),
  });
  const cancel = useMutation({
    mutationFn: () => requestsApi.cancel(request.id, reason.trim() || undefined),
    onSuccess: (updated) => {
      qc.setQueryData(["request", updated.id], updated);
      setCancelling(false);
      toast.success("Request cancelled.");
      void invalidateRequestLists(qc);
    },
    onError: (e) => {
      if (isStaleStateError(e)) {
        setCancelling(false);
        void refresh();
      }
    },
  });

  if (request.status !== "DRAFT" && request.status !== "SUBMITTED") return null;
  return (
    <Card>
      <CardBody className="space-y-3">
        {request.status === "DRAFT" && (
          <Alert tone="info" title="This request is still a draft">
            It has not been sent to an administrator yet.
          </Alert>
        )}
        {submit.isError && <Alert tone="bad">{describeError(submit.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          {request.status === "DRAFT" && (
            <Button loading={submit.isPending} onClick={() => submit.mutate()}>
              Submit for review
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              cancel.reset();
              setCancelling(true);
            }}
          >
            {request.status === "DRAFT" ? "Discard draft" : "Cancel request"}…
          </Button>
        </div>
      </CardBody>
      <Modal
        open={cancelling}
        onOpenChange={(o) => !cancel.isPending && setCancelling(o)}
        title={request.status === "DRAFT" ? "Discard this draft?" : "Cancel this request?"}
        description="This cannot be undone. You can always create a new request."
        footer={
          <>
            <Button variant="secondary" disabled={cancel.isPending} onClick={() => setCancelling(false)}>
              Keep request
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Yes, cancel
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          {({ id }) => (
            <Textarea
              id={id}
              className="min-h-16"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {cancel.isError && !isStaleStateError(cancel.error) && (
          <Alert tone="bad" className="mt-3">
            {describeError(cancel.error)}
          </Alert>
        )}
      </Modal>
    </Card>
  );
}

export function RequestDetailPage() {
  const { id = "" } = useParams();
  const me = useCurrentUser();
  const location = useLocation();
  const query = useRequest(id);
  const justSubmitted = (location.state as { justSubmitted?: string | null } | null)?.justSubmitted;

  if (query.isPending) return <ListSkeleton rows={6} />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <>
        <Link
          to="/requests"
          className="mb-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> My requests
        </Link>
        {notFound ? (
          <Alert tone="warn" title="Request not found">
            It does not exist, or you do not have access to it.
          </Alert>
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }

  const r = query.data;
  const isOwner = r.requester.id === me.id;
  const meta = STATUS_META[r.status];

  return (
    <>
      <Link
        to={isOwner ? "/requests" : me.role === "STOREKEEPER" ? "/issue" : "/review"}
        className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm text-brand-700 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to list
      </Link>
      <PageHeader
        title={r.requestNumber ?? "Draft request"}
        description={meta.meaning}
        actions={<StatusBadge status={r.status} />}
      />

      <div className="space-y-5">
        {justSubmitted !== undefined && (
          <Alert tone="ok" title="Request submitted">
            Your request number is <strong>{justSubmitted}</strong>. It is now waiting for an administrator's
            decision.
          </Alert>
        )}
        {r.status === "REJECTED" && (
          <Alert tone="bad" title="Rejected">
            {r.rejectionReason ?? "No reason recorded."}
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Requested by</dt>
                <dd className="font-medium">
                  {r.requester.fullName} <span className="text-muted">({r.requester.employeeCode})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Department</dt>
                <dd>{r.department ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted">Purpose</dt>
                <dd className="break-words">{r.purpose}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Submitted</dt>
                <dd>{formatDateTime(r.submittedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Decision</dt>
                <dd>{r.decidedBy ? `${r.decidedBy.fullName} · ${formatDateTime(r.decidedAt)}` : "—"}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chemicals ({r.items.length})</CardTitle>
          </CardHeader>
          <ItemsList request={r} />
        </Card>

        {isOwner && <OwnerActions request={r} />}
        {me.role === "ADMIN" && r.status === "SUBMITTED" && <ReviewPanel request={r} />}
        {me.role === "STOREKEEPER" && (r.status === "APPROVED" || r.status === "PARTIALLY_ISSUED") && (
          <IssuePanel request={r} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardBody>
            <TimelineView request={r} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
