import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Send, Trash2 } from "lucide-react";
import { useReducer, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { describeError, isStaleStateError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { CreateRequestBody } from "@/types/api";
import { ChemicalPicker } from "./chemical-picker";
import { cartProblems, cartReducer, cartToItems, isValidQuantity, type CartLine } from "./cart";
import { invalidateRequestData, invalidateRequestLists, requestsApi } from "./requests-api";

const detailsSchema = z.object({
  purpose: z
    .string()
    .trim()
    .min(5, "Describe the purpose (at least 5 characters)")
    .max(1000, "Keep it under 1000 characters"),
  department: z.string().trim().max(100, "Keep it under 100 characters").optional(),
});
type Details = z.infer<typeof detailsSchema>;
type Step = "items" | "details" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "items", label: "Chemicals" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review & submit" },
];

function Stepper({ step }: { step: Step }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="mb-5 flex flex-wrap gap-2" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li
          key={s.id}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            i === current
              ? "bg-brand-600 text-white"
              : i < current
                ? "bg-ok-50 text-ok-700"
                : "bg-canvas text-muted ring-1 ring-line",
          )}
        >
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

function CartTable({
  cart,
  editable,
  dispatch,
}: {
  cart: CartLine[];
  editable: boolean;
  dispatch?: (a: Parameters<typeof cartReducer>[1]) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {cart.map((l) => {
        const warn = l.available !== null && l.quantity > l.available;
        return (
          <li key={l.packSizeId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.chemicalName}</p>
              <p className="text-xs text-muted">
                <span className="font-mono">{l.chemicalCode}</span> · {l.packLabel}
              </p>
              {warn && (
                <p className="mt-0.5 text-xs text-warn-700">
                  More than the {l.available} currently available. Stock is not reserved when you submit; the
                  storekeeper issues what is in stock.
                </p>
              )}
            </div>
            {editable && dispatch ? (
              <>
                <label className="sr-only" htmlFor={`cart-${l.packSizeId}`}>
                  Number of {l.packLabel} packs of {l.chemicalName}
                </label>
                <Input
                  id={`cart-${l.packSizeId}`}
                  inputMode="numeric"
                  className="w-20 text-center"
                  value={Number.isNaN(l.quantity) ? "" : String(l.quantity)}
                  aria-invalid={!isValidQuantity(l.quantity)}
                  onChange={(e) =>
                    dispatch({
                      type: "setQuantity",
                      packSizeId: l.packSizeId,
                      quantity: /^\d+$/.test(e.target.value.trim())
                        ? Number(e.target.value.trim())
                        : Number.NaN,
                    })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${l.chemicalName} ${l.packLabel}`}
                  onClick={() => dispatch({ type: "remove", packSizeId: l.packSizeId })}
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <p className="text-sm font-semibold tabular-nums">
                {l.quantity} × {l.packLabel}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NewRequestPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("items");
  const [cart, dispatch] = useReducer(cartReducer, [] as CartLine[]);
  const [details, setDetails] = useState<Details>({ purpose: "", department: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // A draft is created once; if the following submit fails the user retries WITHOUT creating a second draft.
  const draft = useRef<{ id: string; signature: string } | null>(null);

  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: details,
    mode: "onTouched",
  });
  const problems = cartProblems(cart);
  const cartPackIds = new Set(cart.map((l) => l.packSizeId));

  const body = (): CreateRequestBody => ({
    purpose: details.purpose.trim(),
    ...(details.department?.trim() ? { department: details.department.trim() } : {}),
    items: cartToItems(cart),
  });

  async function submit() {
    if (submitting) return; // guards against double clicks / double taps
    setSubmitting(true);
    setError(null);
    try {
      const payload = body();
      const signature = JSON.stringify(payload);
      if (!draft.current) {
        const created = await requestsApi.createDraft(payload);
        draft.current = { id: created.id, signature };
      } else if (draft.current.signature !== signature) {
        await requestsApi.updateDraft(draft.current.id, payload); // user went back and edited after a failed attempt
        draft.current.signature = signature;
      }
      const submitted = await requestsApi.submit(draft.current.id);
      qc.setQueryData(["request", submitted.id], submitted);
      void invalidateRequestLists(qc);
      navigate(`/requests/${submitted.id}`, {
        replace: true,
        state: { justSubmitted: submitted.requestNumber },
      });
    } catch (e) {
      setError(e);
      if (isStaleStateError(e)) void invalidateRequestData(qc);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New chemical request"
        description="Choose chemicals and pack sizes, add the purpose, review, then submit for administrator approval."
      />
      <Stepper step={step} />

      {step === "items" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>1. Find chemicals</CardTitle>
            </CardHeader>
            <ChemicalPicker cartPackIds={cartPackIds} onAdd={(line) => dispatch({ type: "add", line })} />
          </Card>
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Your request ({cart.length})</CardTitle>
              {cart.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "clear" })}>
                  Clear all
                </Button>
              )}
            </CardHeader>
            {cart.length === 0 ? (
              <CardBody>
                <p className="text-sm text-muted">Nothing added yet. Search on the left and press Add.</p>
              </CardBody>
            ) : (
              <CartTable cart={cart} editable dispatch={dispatch} />
            )}
            <CardBody className="space-y-3 border-t border-line">
              {cart.length > 0 && problems.length > 0 && <Alert tone="warn">{problems[0]}</Alert>}
              <Button className="w-full" disabled={problems.length > 0} onClick={() => setStep("details")}>
                Continue <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {step === "details" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>2. Purpose and department</CardTitle>
          </CardHeader>
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => {
              setDetails(values);
              setStep("review");
            })}
          >
            <CardBody className="space-y-4">
              <Field
                label="Purpose"
                hint="What will the chemicals be used for?"
                error={form.formState.errors.purpose?.message}
              >
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    {...form.register("purpose")}
                  />
                )}
              </Field>
              <Field
                label="Department or section (optional)"
                error={form.formState.errors.department?.message}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    {...form.register("department")}
                  />
                )}
              </Field>
            </CardBody>
            <div className="flex justify-between gap-2 border-t border-line px-5 py-3">
              <Button variant="secondary" onClick={() => setStep("items")}>
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </Button>
              <Button type="submit">
                Review <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === "review" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>3. Review and submit</CardTitle>
          </CardHeader>
          <CartTable cart={cart} editable={false} />
          <CardBody className="space-y-3 border-t border-line text-sm">
            <p>
              <span className="font-medium">Purpose:</span> {details.purpose}
            </p>
            {details.department?.trim() && (
              <p>
                <span className="font-medium">Department:</span> {details.department}
              </p>
            )}
            <Alert tone="info">
              Submitting sends this request to an administrator for approval. Approval does not hand over any
              chemicals; the storekeeper records the actual issue separately.
            </Alert>
            {error !== null && (
              <Alert tone="bad" title="Could not submit">
                {describeError(error)}
                {draft.current && (
                  <p className="mt-1">
                    Your request was saved as a draft. Press Submit again to retry; it will not be duplicated.
                  </p>
                )}
              </Alert>
            )}
          </CardBody>
          <div className="flex justify-between gap-2 border-t border-line px-5 py-3">
            <Button variant="secondary" disabled={submitting} onClick={() => setStep("details")}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </Button>
            <Button loading={submitting} onClick={() => void submit()}>
              <Send className="size-4" aria-hidden="true" /> Submit request
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
