import { unprocessable } from "./errors.js";

export type TransactionType = "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "REVERSAL";
type DirectType = Exclude<TransactionType, "REVERSAL">;

/**
 * Sign convention (documented in docs/database-design.md):
 * stock_transactions.quantity is ALWAYS a positive integer (number of packs).
 * Direction is implied by transaction_type:
 *   RECEIPT, ADJUSTMENT_IN  => +quantity on hand
 *   ISSUE, ADJUSTMENT_OUT   => -quantity on hand
 *   REVERSAL                => opposite of the transaction it reverses
 */
export function signFor(type: DirectType): 1 | -1 {
  return type === "RECEIPT" || type === "ADJUSTMENT_IN" ? 1 : -1;
}

export function signedDelta(type: TransactionType, quantity: number, reversedType?: DirectType): number {
  assertPositiveInt(quantity, "quantity");
  if (type === "REVERSAL") {
    if (!reversedType) throw new Error("A REVERSAL needs the type of the transaction it reverses.");
    return -signFor(reversedType) * quantity;
  }
  return signFor(type) * quantity;
}

export const availableQuantity = (onHand: number, reserved: number): number => onHand - reserved;

export function assertPositiveInt(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw unprocessable("VALIDATION_ERROR", `${field} must be a positive whole number.`, [
      { path: field, message: "must be a positive whole number" },
    ]);
  }
}

export const remainingToIssue = (approved: number | null, issued: number): number =>
  Math.max(0, (approved ?? 0) - issued);

/** Resolve per-line approved quantities (default: approve exactly what was requested). Never exceeds requested. */
export function resolveApprovedQuantities(
  items: readonly { id: string; requestedQuantity: number }[],
  overrides: readonly { requestItemId: string; approvedQuantity: number }[] | undefined,
): Map<string, number> {
  const known = new Map(items.map((i) => [i.id, i.requestedQuantity]));
  const result = new Map(items.map((i) => [i.id, i.requestedQuantity]));
  const seen = new Set<string>();
  for (const o of overrides ?? []) {
    const requested = known.get(o.requestItemId);
    if (requested === undefined) {
      throw unprocessable(
        "VALIDATION_ERROR",
        "approvedQuantities references an item that is not part of this request.",
      );
    }
    if (seen.has(o.requestItemId))
      throw unprocessable("VALIDATION_ERROR", "Duplicate item in approvedQuantities.");
    seen.add(o.requestItemId);
    if (
      !Number.isSafeInteger(o.approvedQuantity) ||
      o.approvedQuantity < 0 ||
      o.approvedQuantity > requested
    ) {
      throw unprocessable(
        "VALIDATION_ERROR",
        "Approved quantity must be between 0 and the requested quantity.",
      );
    }
    result.set(o.requestItemId, o.approvedQuantity);
  }
  if (![...result.values()].some((q) => q > 0)) {
    throw unprocessable(
      "VALIDATION_ERROR",
      "At least one item must have an approved quantity greater than zero; reject the request instead.",
    );
  }
  return result;
}
