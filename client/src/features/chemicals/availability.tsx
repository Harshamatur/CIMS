import { Badge } from "@/components/ui/badge";
import type { BalanceView } from "@/types/api";

/** Availability in whole packs of THAT pack size (never converted between mass and volume). */
export function Availability({ balance }: { balance: BalanceView | null }) {
  if (!balance) return <Badge>No stock record</Badge>;
  if (balance.available <= 0) return <Badge tone="bad">Out of stock</Badge>;
  if (balance.lowStock) return <Badge tone="warn">Low · {balance.available} available</Badge>;
  return <Badge tone="ok">{balance.available} available</Badge>;
}

/** Extra figures visible only to ADMIN / STOREKEEPER (the API omits them for employees). */
export function StockDetail({ balance }: { balance: BalanceView | null }) {
  if (!balance || balance.onHand === undefined) return null;
  return (
    <span className="text-xs text-muted">
      On hand {balance.onHand} · reserved {balance.reserved ?? 0} · alert at {balance.minimumQuantity ?? 0}
    </span>
  );
}
