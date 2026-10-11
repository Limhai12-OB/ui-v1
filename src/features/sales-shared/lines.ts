import { z } from "zod";
import type { Currency, ID, Item, LineItem, PaymentMethod } from "@/types";
import { uid } from "@/store/app-store";
import { convert, roundMoney } from "@/lib/currency";

/** One editable document line (invoice or planned purchase). */
export const lineSchema = z.object({
  itemId: z.string().optional(),
  description: z.string().trim().min(1, "Describe this line").max(120, "Keep it under 120 characters"),
  quantity: z.number({ error: "Enter a quantity" }).positive("Quantity must be more than 0").max(100_000, "Quantity is too large"),
  unitPrice: z.number({ error: "Enter a unit price" }).min(0, "Price can't be negative").max(100_000_000, "Price is too large"),
});
export type LineValue = z.infer<typeof lineSchema>;

/** Fields every line-based document form shares with the LineItemsEditor. */
export interface LinesForm {
  branchId: string;
  currency: Currency;
  lines: LineValue[];
  discount: number;
  taxEnabled?: boolean;
}

export const VAT_RATE = 10;

export const emptyLine = (): LineValue => ({ itemId: undefined, description: "", quantity: 1, unitPrice: 0 });

export function toLineItems(lines: LineValue[]): LineItem[] {
  return lines.map((l) => ({ id: uid("ln"), itemId: l.itemId || undefined, description: l.description.trim(), quantity: l.quantity, unitPrice: l.unitPrice }));
}

export function fromLineItems(lines: LineItem[]): LineValue[] {
  return lines.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice }));
}

/** Item selling price in the document currency (null when no rate is configured). */
export function itemPrice(item: Item, currency: Currency, rate: number | null): number | null {
  const v = convert(item.sellingPrice, item.currency, currency, rate);
  return v === null ? null : roundMoney(v, currency);
}

export interface StockShortfall {
  item: Item;
  requested: number;
  available: number;
}

/** Items whose combined requested quantity exceeds on-hand stock at the branch. */
export function stockShortfalls(lines: Pick<LineValue, "itemId" | "quantity">[], items: Item[], branchId: ID | undefined): StockShortfall[] {
  if (!branchId) return [];
  const req = new Map<ID, number>();
  for (const l of lines) if (l.itemId && Number.isFinite(l.quantity)) req.set(l.itemId, (req.get(l.itemId) ?? 0) + l.quantity);
  const out: StockShortfall[] = [];
  for (const [itemId, requested] of req) {
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;
    const available = item.stock[branchId] ?? 0;
    if (requested > available) out.push({ item, requested, available });
  }
  return out;
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "aba_pay", label: "ABA Pay" },
  { value: "wing", label: "Wing" },
  { value: "khqr", label: "KHQR" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;

/** Sum amounts per currency without ever mixing them. */
export function sumByCurrency(values: { amount: number; currency: Currency }[]): Record<Currency, number> {
  const out: Record<Currency, number> = { USD: 0, KHR: 0 };
  for (const v of values) out[v.currency] += v.amount;
  out.USD = roundMoney(out.USD, "USD");
  out.KHR = roundMoney(out.KHR, "KHR");
  return out;
}

/** Cross-field rules shared by line-based document schemas (use in superRefine). */
export function refineLines(v: { lines: LineValue[]; discount: number; currency: Currency }, ctx: z.RefinementCtx) {
  const subtotal = roundMoney(v.lines.reduce((s, l) => s + (Number.isFinite(l.quantity) ? l.quantity : 0) * (Number.isFinite(l.unitPrice) ? l.unitPrice : 0), 0), v.currency);
  if (v.discount > subtotal) ctx.addIssue({ code: "custom", path: ["discount"], message: "Discount can't be more than the subtotal" });
  if (v.currency === "KHR" && !Number.isInteger(v.discount)) ctx.addIssue({ code: "custom", path: ["discount"], message: "Riel amounts must be whole numbers" });
}

export const linesArraySchema = z.array(lineSchema).min(1, "Add at least one line item");
export const discountSchema = z.number({ error: "Enter a discount (0 for none)" }).min(0, "Discount can't be negative");
