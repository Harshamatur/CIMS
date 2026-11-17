import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/feedback/toast";
import { Availability } from "@/features/chemicals/availability";
import {
  invalidateInventoryData,
  invalidateRequestData,
  invalidateRequestLists,
  requestsApi,
} from "@/features/requests/requests-api";
import { describeError, isStaleStateError } from "@/lib/errors";
import { IssueKeyStore } from "@/lib/idempotency";
import type { IssueBody, RequestDetail, RequestItem } from "@/types/api";

/** Pure helper (unit-tested): validates what the storekeeper typed and builds the API body. */
export function buildIssueBody(
  items: readonly RequestItem[],
  values: Record<string, string>,
  note: string,
): { body: IssueBody } | { problem: string } {
  const lines: IssueBody["lines"] = [];
  for (const item of items) {
    if (item.remainingToIssue <= 0) continue;
    const raw = (values[item.id] ?? String(item.remainingToIssue)).trim();
    if (!/^\d+$/.test(raw))
      return { problem: `${item.chemical.name} (${item.packSize.label}): enter a whole number of packs.` };
    const n = Number(raw);
    if (n > item.remainingToIssue) {
      return {
        problem: `${item.chemical.name} (${item.packSize.label}): only ${item.remainingToIssue} approved pack(s) remain.`,
      };
    }
    if (n > 0) lines.push({ requestItemId: item.id, quantity: n });
  }
  if (lines.length === 0) return { problem: "Enter a quantity above zero for at least one item." };
  return { body: { lines, ...(note.trim() ? { note: note.trim() } : {}) } };
}

export function IssuePanel({ request }: { request: RequestDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const items = request.items.filter((i) => i.remainingToIssue > 0);

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const keys = useRef(new IssueKeyStore());

  const issue = useMutation({
    mutationFn: (body: IssueBody) => requestsApi.issue(request.id, body, keys.current.keyFor(body)),
    onSuccess: (updated) => {
      keys.current.reset();
      setConfirming(false);
      setValues({});
      setNote("");
      qc.setQueryData(["request", updated.id], updated);
      toast.success("Issue recorded. Stock has been updated.");
      void invalidateRequestLists(qc);
      void invalidateInventoryData(
        qc,
        request.items.map((item) => item.chemical.id),
      );
    },
    onError: (e) => {
      if (isStaleStateError(e)) {
        setConfirming(false);
        toast.error(describeError(e)); // the dialog is closing, so say clearly why nothing was recorded
        void invalidateRequestData(qc, request.id);
        void invalidateInventoryData(
          qc,
          request.items.map((item) => item.chemical.id),
        );
      }
    },
  });

  const built = buildIssueBody(items, values, note);
  const openConfirm = () => {
    if ("problem" in built) return setProblem(built.problem);
    setProblem(null);
    issue.reset();
    setConfirming(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record issue (physical hand-over)</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-muted">
          Enter the quantity actually handed over. Stock is deducted when you confirm. You can issue part of
          an item now and the rest later.
        </p>
        <ul className="space-y-3">
          {items.map((item) => {
            const balance = item.availability;
            const typed = (values[item.id] ?? String(item.remainingToIssue)).trim();
            const over = /^\d+$/.test(typed) && balance !== null && Number(typed) > balance.available;
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {item.chemical.name} · {item.packSize.label}
                  </p>
                  <p className="text-xs text-muted">
                    Approved {item.approvedQuantity ?? 0} · issued {item.issuedQuantity} ·{" "}
                    <strong>remaining {item.remainingToIssue}</strong>
                    {item.chemical.storageLocation && ` · Rack ${item.chemical.storageLocation}`}
                  </p>
                  <div className="mt-1">
                    <Availability balance={balance} />
                  </div>
                  {over && (
                    <p className="mt-1 text-xs font-medium text-warn-700">
                      More than the {balance?.available} in stock; the issue will be refused.
                    </p>
                  )}
                </div>
                <label className="sr-only" htmlFor={`issue-${item.id}`}>
                  Packs to issue for {item.chemical.name} {item.packSize.label}
                </label>
                <Input
                  id={`issue-${item.id}`}
                  inputMode="numeric"
                  className="w-24 text-center"
                  value={values[item.id] ?? String(item.remainingToIssue)}
                  onChange={(e) => {
                    setProblem(null);
                    setValues((v) => ({ ...v, [item.id]: e.target.value }));
                  }}
                />
              </li>
            );
          })}
        </ul>
        <div>
          <label htmlFor="issue-note" className="mb-1.5 block text-sm font-medium">
            Note (optional)
          </label>
          <Textarea
            id="issue-note"
            className="min-h-16"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {problem && <Alert tone="bad">{problem}</Alert>}
        <Button onClick={openConfirm}>
          <PackageCheck className="size-4" aria-hidden="true" /> Record issue…
        </Button>
      </CardBody>

      <Modal
        open={confirming}
        onOpenChange={(o) => !issue.isPending && setConfirming(o)}
        title="Confirm physical issue"
        description="Stock is deducted immediately. This cannot be undone from this screen."
        footer={
          <>
            <Button variant="secondary" disabled={issue.isPending} onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button
              variant="success"
              loading={issue.isPending}
              disabled={"problem" in built}
              onClick={() => "body" in built && issue.mutate(built.body)}
            >
              Confirm issue
            </Button>
          </>
        }
      >
        {"body" in built && (
          <ul className="space-y-1 text-sm">
            {built.body.lines.map((l) => {
              const item = items.find((i) => i.id === l.requestItemId);
              return (
                <li key={l.requestItemId} className="flex justify-between gap-3">
                  <span>
                    {item?.chemical.name} · {item?.packSize.label}
                  </span>
                  <span className="font-semibold tabular-nums">{l.quantity} pack(s)</span>
                </li>
              );
            })}
          </ul>
        )}
        {issue.isError && (
          <Alert
            tone="bad"
            className="mt-3"
            title={
              issue.error instanceof Error && "isNetworkError" in issue.error && issue.error.isNetworkError
                ? "Connection problem"
                : "Not recorded"
            }
          >
            {describeError(issue.error)}
            {!isStaleStateError(issue.error) && (
              <p className="mt-1">
                It is safe to press Confirm again: the same submission can never deduct stock twice.
              </p>
            )}
          </Alert>
        )}
      </Modal>
    </Card>
  );
}
