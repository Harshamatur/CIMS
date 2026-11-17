import type { RequestItemInput } from "@/types/api";

export const MAX_LINE_QUANTITY = 1_000_000;

export interface CartLine {
  chemicalId: string;
  chemicalCode: string;
  chemicalName: string;
  packSizeId: string;
  packLabel: string;
  quantity: number;
  /** Availability when the line was added (informational; stock is NOT reserved by a request). */
  available: number | null;
}

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "setQuantity"; packSizeId: string; quantity: number }
  | { type: "remove"; packSizeId: string }
  | { type: "clear" };

export const isValidQuantity = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= MAX_LINE_QUANTITY;

/** The backend forbids two lines for the same pack size, so adding it again increases the existing line. */
export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const existing = state.find((l) => l.packSizeId === action.line.packSizeId);
      if (!existing) return [...state, action.line];
      return state.map((l) =>
        l.packSizeId === action.line.packSizeId
          ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + action.line.quantity) }
          : l,
      );
    }
    case "setQuantity":
      return state.map((l) => (l.packSizeId === action.packSizeId ? { ...l, quantity: action.quantity } : l));
    case "remove":
      return state.filter((l) => l.packSizeId !== action.packSizeId);
    case "clear":
      return [];
  }
}

export const cartToItems = (cart: readonly CartLine[]): RequestItemInput[] =>
  cart.map((l) => ({ chemicalId: l.chemicalId, packSizeId: l.packSizeId, quantity: l.quantity }));

export const cartProblems = (cart: readonly CartLine[]): string[] => {
  const problems: string[] = [];
  if (cart.length === 0) problems.push("Add at least one chemical.");
  for (const l of cart) {
    if (!isValidQuantity(l.quantity))
      problems.push(`${l.chemicalName} (${l.packLabel}): enter a whole number of packs, 1 or more.`);
  }
  return problems;
};
