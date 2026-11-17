import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { useCurrentUser } from "@/features/auth/auth";
import { useToast } from "@/components/feedback/toast";
import { get, api } from "@/lib/api-client";
import { describeError } from "@/lib/errors";
import { newId } from "@/lib/utils";
import type { InventoryBalance, Paged } from "@/types/api";

interface PendingMovement {
  id: string;
  kind: "receipt" | "adjustment";
  chemicalId: string;
  chemicalName: string;
  chemicalCode: string;
  packSizeId: string;
  packLabel: string;
  quantity: number;
  reason: string;
  direction?: "IN" | "OUT";
}

function BalanceActions({
  row,
  threshold,
  onThresholdChange,
  onStageMovement,
}: {
  row: InventoryBalance;
  threshold: string;
  onThresholdChange: (row: InventoryBalance, value: string) => void;
  onStageMovement: (movement: PendingMovement) => void;
}) {
  const me = useCurrentUser();
  const toast = useToast();
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [stagedMessage, setStagedMessage] = useState("");
  const submitMovement = (event: FormEvent, kind: "receipt" | "adjustment") => {
    event.preventDefault();
    if (
      !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 1 ||
      reason.trim().length < (kind === "receipt" ? 3 : 10)
    ) {
      setError(
        kind === "receipt"
          ? "Enter a positive whole-pack quantity and a reason of at least 3 characters."
          : "Enter a positive whole-pack quantity and an adjustment reason of at least 10 characters.",
      );
      return;
    }
    onStageMovement({
      id: newId(),
      kind,
      chemicalId: row.chemicalId,
      chemicalName: row.chemicalName,
      chemicalCode: row.chemicalCode,
      packSizeId: row.packSizeId,
      packLabel: row.packLabel,
      quantity: Number(quantity),
      reason: reason.trim(),
      ...(kind === "adjustment" ? { direction } : {}),
    });
    setError("");
    setStagedMessage(
      `${kind === "receipt" ? "Receipt" : "Adjustment"} added to pending changes. Click Save changes above the table to update stock.`,
    );
    setQuantity("");
    setReason("");
    toast.success(
      `Added ${kind === "receipt" ? "receipt" : "adjustment"} to pending changes. Click Save changes to apply it.`,
    );
  };
  return (
    <details className="min-w-[420px]">
      <summary className="cursor-pointer text-sm font-medium text-brand-700">Manage balance</summary>
      <div className="mt-3 space-y-3 rounded-md bg-canvas p-3">
        {error && <Alert tone="bad">{error}</Alert>}
        {stagedMessage && <p role="status" className="text-sm font-medium text-ok-700">{stagedMessage}</p>}
        <form className="flex items-end gap-2" onSubmit={(e) => e.preventDefault()}>
          <label className="min-w-0 flex-1 text-xs font-medium">
            Low-stock threshold
            <Input
              className="mt-1"
              type="number"
              min="0"
              max="1000000"
              required
              step="1"
              value={threshold}
              onChange={(e) => onThresholdChange(row, e.target.value)}
            />
          </label>
        </form>
        <form className="space-y-2" onSubmit={(e) => submitMovement(e, "receipt")}>
          <p className="text-xs font-semibold">Receive stock</p>
          <div className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              aria-label="Receipt quantity in packs"
              type="number"
              min="1"
              step="1"
              placeholder="Packs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Input
              className="min-w-0 flex-1"
              aria-label="Receipt reference"
              placeholder="GRN / reference"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button type="submit" size="sm" className="shrink-0">
              Add receipt
            </Button>
          </div>
        </form>
        {me.role === "ADMIN" && (
          <form className="space-y-2" onSubmit={(e) => submitMovement(e, "adjustment")}>
            <div>
              <p className="text-xs font-semibold">Inventory adjustment</p>
              <p className="text-xs text-muted">
                Increase adds packs; Decrease removes available packs. Add adjustment stages it; Save changes above the table applies it. A reason of at least 10 characters is required.
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                className="w-28 shrink-0"
                aria-label="Adjustment direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value as "IN" | "OUT")}
              >
                <option value="IN">Increase</option>
                <option value="OUT">Decrease</option>
              </Select>
              <Input
                className="min-w-0 flex-1"
                aria-label="Adjustment quantity in packs"
                type="number"
                min="1"
                step="1"
                placeholder="Packs"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <Input
                className="min-w-0 flex-1"
                aria-label="Adjustment reason"
                placeholder="Reason (10+ chars)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button type="submit" size="sm" className="shrink-0">
                Add adjustment
              </Button>
            </div>
          </form>
        )}
      </div>
    </details>
  );
}

export function InventoryPage() {
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  const [pendingThresholds, setPendingThresholds] = useState<Record<string, string>>({});
  const [pendingMovements, setPendingMovements] = useState<PendingMovement[]>([]);
  const [saveError, setSaveError] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const lowOnly = params.get("lowOnly") === "true";
  const query = useQuery({
    queryKey: ["inventory", { page, lowOnly }],
    queryFn: ({ signal }) =>
      get<Paged<InventoryBalance>>("/inventory", { page, pageSize: 15, lowOnly }, signal),
  });
  const saveChanges = useMutation({
    mutationFn: async () => {
      const thresholdChanges = Object.entries(pendingThresholds);
      const thresholdResults = await Promise.allSettled(
        thresholdChanges.map(([packSizeId, value]) =>
          api(`/inventory/${packSizeId}/threshold`, {
            method: "PATCH",
            body: { minimumQuantity: Number(value) },
          }),
        ),
      );
      const savedMovements: string[] = [];
      const failedMovements: { id: string; error: string }[] = [];
      for (const movement of pendingMovements) {
        try {
          await api(`/stock-transactions/${movement.kind === "receipt" ? "receipts" : "adjustments"}`, {
            method: "POST",
            headers: { "Idempotency-Key": movement.id },
            body:
              movement.kind === "receipt"
                ? {
                    chemicalId: movement.chemicalId,
                    packSizeId: movement.packSizeId,
                    quantity: movement.quantity,
                    reason: movement.reason,
                  }
                : {
                    chemicalId: movement.chemicalId,
                    packSizeId: movement.packSizeId,
                    quantity: movement.quantity,
                    reason: movement.reason,
                    direction: movement.direction,
                  },
          });
          savedMovements.push(movement.id);
        } catch (error) {
          failedMovements.push({ id: movement.id, error: describeError(error) });
        }
      }
      return {
        savedThresholds: thresholdChanges.flatMap((change, index) =>
          thresholdResults[index]?.status === "fulfilled" ? [change] : [],
        ),
        failedThresholds: thresholdChanges.flatMap(([id], index) => {
          const result = thresholdResults[index];
          return result?.status === "rejected" ? [{ id, error: describeError(result.reason) }] : [];
        }),
        savedMovements,
        failedMovements,
      };
    },
    onSuccess: ({ savedThresholds, failedThresholds, savedMovements, failedMovements }) => {
      setPendingThresholds((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([id, value]) =>
              !savedThresholds.some(([savedId, savedValue]) => savedId === id && savedValue === value),
          ),
        ),
      );
      setPendingMovements((current) => current.filter((movement) => !savedMovements.includes(movement.id)));
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void qc.invalidateQueries({ queryKey: ["stock-transactions"] });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      const failed = [...failedThresholds, ...failedMovements];
      const savedCount = savedThresholds.length + savedMovements.length;
      if (failed.length) {
        setSaveError(
          savedCount +
            " change" +
            (savedCount === 1 ? "" : "s") +
            " saved. " +
            failed.length +
            " remain pending: " +
            failed.map((item) => item.error).join("; "),
        );
      } else {
        setSaveError("");
        toast.success(savedCount + " inventory change" + (savedCount === 1 ? "" : "s") + " saved.");
      }
    },
    onError: (error) => setSaveError(describeError(error)),
  });
  const changeThreshold = (row: InventoryBalance, value: string) => {
    setPendingThresholds((current) => {
      if (value.trim() !== "" && Number(value) === row.minimumQuantity) {
        const rest = { ...current };
        delete rest[row.packSizeId];
        return rest;
      }
      return { ...current, [row.packSizeId]: value };
    });
    setSaveError("");
  };
  const savePendingThresholds = () => {
    const invalid = Object.entries(pendingThresholds).find(
      ([, value]) =>
        value.trim() === "" ||
        !Number.isInteger(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 1_000_000,
    );
    if (invalid) {
      setSaveError("Enter a whole-number threshold from 0 to 1,000,000 for each edited balance.");
      return;
    }
    saveChanges.mutate();
  };
  const stageMovement = (movement: PendingMovement) => {
    setPendingMovements((current) => [...current, movement]);
    setSaveError("");
  };
  const pendingCount = Object.keys(pendingThresholds).length + pendingMovements.length;
  return (
    <>
      <PageHeader
        title="Inventory management"
        description="Review stock by chemical and pack size, maintain alert thresholds, and record stock movements."
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(e) => {
                setParams((current) => {
                  if (e.target.checked) current.set("lowOnly", "true");
                  else current.delete("lowOnly");
                  return current;
                });
                setPage(1);
              }}
            />{" "}
            Show low-stock balances only
          </label>
          <p className="text-xs text-muted">
            Quantities are individual packs; different pack sizes are not combined.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div aria-live="polite" className="min-h-5 text-sm text-muted">
            {saveError ? (
              <Alert tone="bad">{saveError}</Alert>
            ) : pendingCount > 0 ? (
              pendingCount + " pending inventory change" + (pendingCount === 1 ? "" : "s")
            ) : (
              "Threshold edits are saved together."
            )}
          </div>
          <Button
            type="button"
            disabled={pendingCount === 0}
            loading={saveChanges.isPending}
            onClick={savePendingThresholds}
          >
            Save changes
          </Button>
        </div>
        {pendingMovements.length > 0 && (
          <ul aria-label="Pending stock movements" className="space-y-2 border-b border-line bg-canvas p-4">
            {pendingMovements.map((movement) => (
              <li key={movement.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {movement.kind === "receipt" ? "Receipt" : "Adjustment " + movement.direction} ·{" "}
                  {movement.chemicalName} ({movement.packLabel}) · {movement.quantity} pack
                  {movement.quantity === 1 ? "" : "s"} · {movement.reason}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saveChanges.isPending}
                  onClick={() =>
                    setPendingMovements((current) => current.filter((item) => item.id !== movement.id))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </div>
        ) : query.data.data.length === 0 ? (
          <EmptyState title="No inventory balances found">
            Add a chemical and pack size, then record a receipt to initialize stock.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-sm">
                <thead className="bg-canvas text-xs uppercase text-muted">
                  <tr>
                    {[
                      "Chemical",
                      "Pack",
                      "On hand",
                      "Reserved",
                      "Available",
                      "Minimum",
                      "Updated",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {query.data.data.map((r) => (
                    <tr key={r.id} className={r.lowStock ? "bg-warn-50/40" : ""}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{r.chemicalName}</span>
                        <span className="block text-xs text-muted">
                          {r.chemicalCode}
                          {r.storageLocation ? ` · ${r.storageLocation}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">{r.packLabel}</td>
                      <td className="px-4 py-3 tabular-nums">{r.onHandQuantity}</td>
                      <td className="px-4 py-3 tabular-nums">{r.reservedQuantity}</td>
                      <td className="px-4 py-3 tabular-nums">{r.availableQuantity}</td>
                      <td className="px-4 py-3 tabular-nums">{r.minimumQuantity}</td>
                      <td className="px-4 py-3">{new Date(r.updatedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <BalanceActions
                          row={r}
                          threshold={pendingThresholds[r.packSizeId] ?? String(r.minimumQuantity)}
                          onThresholdChange={changeThreshold}
                          onStageMovement={stageMovement}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={query.data.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
