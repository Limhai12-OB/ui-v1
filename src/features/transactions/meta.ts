import type { Transaction, TransactionSource, TransactionType } from "@/types";
import { addDaysISO, monthRange, previousMonth, today } from "@/lib/date";

export const TYPE_LABEL: Record<TransactionType, string> = { income: "Income", expense: "Expense", transfer: "Transfer" };

export const SOURCE_LABEL: Record<TransactionSource, string> = {
  manual: "Manual entry",
  invoice_payment: "Invoice payment",
  bill_payment: "Bill payment",
  item_sale: "Item sale",
  walk_in_sale: "Walk-in sale",
  statement_import: "Bank statement",
  document_import: "Document import",
  integration: "Integration (POS)",
};

export type DatePreset = "this_month" | "last_month" | "last_90" | "all";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_90", label: "Last 90 days" },
  { value: "all", label: "All dates" },
];

/** Inclusive date range for a preset, relative to the demo clock. */
export function presetRange(p: DatePreset): { start: string; end: string } | null {
  const t = today();
  const month = t.slice(0, 7);
  if (p === "this_month") return { start: monthRange(month).start, end: t };
  if (p === "last_month") return monthRange(previousMonth(month));
  if (p === "last_90") return { start: addDaysISO(t, -89), end: t };
  return null;
}

/** Link to the record that produced a transaction, if it lives on a known route. */
export function sourceLink(tx: Transaction): { href: string; label: string } | null {
  switch (tx.source) {
    case "invoice_payment":
      return tx.sourceId ? { href: `/invoices/${tx.sourceId}`, label: "View invoice" } : null;
    case "bill_payment":
      return tx.sourceId ? { href: `/bills/${tx.sourceId}`, label: "View bill" } : null;
    case "walk_in_sale":
    case "item_sale":
      return { href: "/walk-in-sales", label: "View walk-in sales" };
    case "statement_import":
    case "document_import":
      return { href: "/banking/import-history", label: "View import history" };
    default:
      return null;
  }
}
