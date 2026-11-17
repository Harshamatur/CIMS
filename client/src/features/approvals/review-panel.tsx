import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/feedback/toast";
import { useCurrentUser } from "@/features/auth/auth";
import { invalidateRequestData, invalidateRequestLists, requestsApi } from "@/features/requests/requests-api";
import { describeError, isStaleStateError } from "@/lib/errors";
import type { ApproveBody, RequestDetail } from "@/types/api";

export const REJECT_MIN = 10;

/** Pure helper (unit-tested): validates partial-approval quantities and builds the API body. */
export function buildApproveBody(
  request: Pick<RequestDetail, "items">,
  adjust: boolean,
  values: Record<string, string>,
  comments: string,
): { body: ApproveBody } | { problem: string } {
  const body: ApproveBody = comments.trim() ? { comments: comments.trim() } : {};
  if (!adjust) return { body };
  const approvedQuantities: NonNullable<ApproveBody["approvedQuantities"]> = [];
  for (const item of request.items) {
    const raw = (values[item.id] ?? String(item.requestedQuantity)).trim();
    if (!/^\d+$/.test(raw))
      return { problem: `${item.chemical.name} (${item.packSize.label}): enter a whole number.` };
    const n = Number(raw);
    if (n > item.requestedQuantity) {
      return {
        problem: `${item.chemical.name} (${item.packSize.label}): you cannot approve more than the ${item.requestedQuantity} requested.`,
      };
    }
    approvedQuantities.push({ requestItemId: item.id, approvedQuantity: n });
  }
  if (!approvedQuantities.some((q) => q.approvedQuantity > 0)) {
    return {
      problem:
        "At least one item must have a quantity above zero. Reject the request instead if nothing should be supplied.",
    };
  }
  return { body: { ...body, approvedQuantities } };
}

export function ReviewPanel({ request }: { request: RequestDetail }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const onDone = (updated: RequestDetail, message: string) => {
    qc.setQueryData(["request", updated.id], updated);
    toast.success(message);
    setDialog(null);
    void invalidateRequestLists(qc);
  };
  const onFail = (e: unknown) => {
    if (isStaleStateError(e)) {
      setDialog(null);
      toast.error(describeError(e));
      void invalidateRequestData(qc, request.id); // show the latest status after a concurrent decision
    }
  };

  const approve = useMutation({
    mutationFn: (body: ApproveBody) => requestsApi.approve(request.id, body),
    onSuccess: (updated) =>
      onDone(updated, "Request approved. No stock has been deducted; the storekeeper will record the issue."),
    onError: onFail,
  });
  const reject = useMutation({
    mutationFn: (r: string) => requestsApi.reject(request.id, r),
    onSuccess: (updated) => onDone(updated, "Request rejected."),
    onError: onFail,
  });

  if (request.requester.id === me.id) {
    return (
      <Alert tone="info" title="Another administrator must review this request">
        You cannot approve or reject your own request.
      </Alert>
    );
  }

  const rejectOk = reason.trim().length >= REJECT_MIN;
  const busy = approve.isPending || reject.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review this request</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-muted">
          Approving authorises the request; it does <strong>not</strong> deduct stock or record a hand-over.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="success"
            onClick={() => {
              setProblem(null);
              approve.reset();
              setDialog("approve");
            }}
          >
            <Check className="size-4" aria-hidden="true" /> Approve…
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              reject.reset();
              setDialog("reject");
            }}
          >
            <X className="size-4" aria-hidden="true" /> Reject…
          </Button>
        </div>
      </CardBody>

      <Modal
        open={dialog === "approve"}
        onOpenChange={(o) => !busy && setDialog(o ? "approve" : null)}
        title="Approve this request?"
        description="The requester and storekeeper will see it as approved. Stock is only deducted when the storekeeper records the issue."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              loading={approve.isPending}
              onClick={() => {
                const built = buildApproveBody(request, adjust, values, comments);
                if ("problem" in built) return setProblem(built.problem);
                setProblem(null);
                approve.mutate(built.body);
              }}
            >
              Confirm approval
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={adjust}
              onChange={(e) => setAdjust(e.target.checked)}
            />
            Approve different quantities (partial approval)
          </label>
          {adjust && (
            <ul className="space-y-2">
              {request.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {item.chemical.name} · {item.packSize.label}{" "}
                    <span className="text-muted">(requested {item.requestedQuantity})</span>
                  </span>
                  <Input
                    aria-label={`Approved quantity for ${item.chemical.name} ${item.packSize.label}`}
                    inputMode="numeric"
                    className="w-20 text-center"
                    value={values[item.id] ?? String(item.requestedQuantity)}
                    onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
          )}
          <Field label="Comments (optional)">
            {({ id }) => (
              <Textarea
                id={id}
                value={comments}
                maxLength={1000}
                onChange={(e) => setComments(e.target.value)}
              />
            )}
          </Field>
          {problem && <Alert tone="bad">{problem}</Alert>}
          {approve.isError && !isStaleStateError(approve.error) && (
            <Alert tone="bad">{describeError(approve.error)}</Alert>
          )}
        </div>
      </Modal>

      <Modal
        open={dialog === "reject"}
        onOpenChange={(o) => !busy && setDialog(o ? "reject" : null)}
        title="Reject this request?"
        description="The requester will see your reason. This decision cannot be changed afterwards."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectOk}
              loading={reject.isPending}
              onClick={() => reject.mutate(reason.trim())}
            >
              Confirm rejection
            </Button>
          </>
        }
      >
        <Field
          label="Reason (required)"
          hint={`At least ${REJECT_MIN} characters · ${reason.trim().length}/1000`}
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
        {reject.isError && !isStaleStateError(reject.error) && (
          <Alert tone="bad" className="mt-3">
            {describeError(reject.error)}
          </Alert>
        )}
      </Modal>
    </Card>
  );
}
