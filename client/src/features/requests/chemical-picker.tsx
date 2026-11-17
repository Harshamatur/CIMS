import { Check, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Pagination } from "@/components/data-display/pagination";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Availability } from "@/features/chemicals/availability";
import { useChemicals } from "@/features/chemicals/chemicals-api";
import { useDebounced } from "@/lib/use-debounced";
import type { Chemical, PackSize } from "@/types/api";
import { isValidQuantity, MAX_LINE_QUANTITY, type CartLine } from "./cart";

function PackRow({
  chemical,
  pack,
  inCart,
  onAdd,
}: {
  chemical: Chemical;
  pack: PackSize;
  inCart: boolean;
  onAdd: (line: CartLine) => void;
}) {
  const [qty, setQty] = useState("1");
  const parsed = /^\d+$/.test(qty) ? Number(qty) : Number.NaN;
  const valid = isValidQuantity(parsed);
  const inputId = `qty-${pack.id}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{pack.label}</p>
        <Availability balance={pack.balance} />
      </div>
      <label htmlFor={inputId} className="sr-only">
        Number of {pack.label} packs for {chemical.name}
      </label>
      <Input
        id={inputId}
        inputMode="numeric"
        className="w-20 text-center"
        value={qty}
        aria-invalid={!valid}
        max={MAX_LINE_QUANTITY}
        onChange={(e) => setQty(e.target.value.trim())}
      />
      <Button
        size="sm"
        variant={inCart ? "secondary" : "primary"}
        disabled={!valid}
        aria-label={`Add ${qty || "0"} × ${pack.label} of ${chemical.name}`}
        onClick={() =>
          onAdd({
            chemicalId: chemical.id,
            chemicalCode: chemical.chemicalCode,
            chemicalName: chemical.name,
            packSizeId: pack.id,
            packLabel: pack.label,
            quantity: parsed,
            available: pack.balance?.available ?? null,
          })
        }
      >
        {inCart ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        {inCart ? "Add more" : "Add"}
      </Button>
    </li>
  );
}

export function ChemicalPicker({
  cartPackIds,
  onAdd,
}: {
  cartPackIds: ReadonlySet<string>;
  onAdd: (line: CartLine) => void;
}) {
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(text.trim(), 300);
  const query = useChemicals({ q: q || undefined, page, pageSize: 6 });

  return (
    <div>
      <div className="border-b border-line p-4">
        <label htmlFor="picker-search" className="sr-only">
          Search chemicals
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="picker-search"
            type="search"
            className="pl-10"
            placeholder="Search by code, name or rack…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {query.isPending ? (
        <ListSkeleton rows={4} />
      ) : query.isError ? (
        <div className="p-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : query.data.data.length === 0 ? (
        <EmptyState title="No chemicals found">Try a different search.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {query.data.data.map((c) => (
              <li key={c.id} className="space-y-2 px-4 py-3">
                <p className="font-semibold">
                  {c.name} <span className="font-mono text-xs font-normal text-muted">{c.chemicalCode}</span>
                </p>
                {c.packSizes.filter((p) => p.isActive).length === 0 ? (
                  <p className="text-sm text-muted">No pack sizes available to request.</p>
                ) : (
                  <ul className="space-y-2">
                    {c.packSizes
                      .filter((p) => p.isActive)
                      .map((p) => (
                        <PackRow
                          key={p.id}
                          chemical={c}
                          pack={p}
                          inCart={cartPackIds.has(p.id)}
                          onAdd={onAdd}
                        />
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <Pagination meta={query.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
