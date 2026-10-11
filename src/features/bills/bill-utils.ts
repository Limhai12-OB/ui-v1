import type { Bill, BillStatus, PaymentMethod } from "@/types";
import { daysBetween, today } from "@/lib/date";

export const BILL_STATUS_ORDER: BillStatus[] = ["open", "partially_paid", "overdue", "paid", "draft", "void"];

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const BILL_PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "aba_pay", label: "ABA Pay" },
  { value: "khqr", label: "KHQR" },
  { value: "wing", label: "Wing" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
];

export const PAYMENT_METHOD_NAME: Record<PaymentMethod, string> = Object.fromEntries(BILL_PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;

export const TERMS_PRESETS = [7, 14, 30] as const;

export type DueTone = "overdue" | "soon" | "upcoming" | "neutral";

/**
 * Relative due label for a bill: "in 4 days", "due today", "6 days overdue".
 * Paid and void bills have no relative label.
 */
export function dueInfo(bill: Pick<Bill, "dueDate">, status: BillStatus, asOf = today()): { label: string | null; tone: DueTone } {
  if (status === "paid" || status === "void") return { label: null, tone: "neutral" };
  const diff = daysBetween(asOf, bill.dueDate);
  if (diff < 0) {
    const n = Math.abs(diff);
    return { label: `${n} ${n === 1 ? "day" : "days"} overdue`, tone: "overdue" };
  }
  if (diff === 0) return { label: "Due today", tone: "soon" };
  if (diff === 1) return { label: "Due tomorrow", tone: "soon" };
  return { label: `in ${diff} days`, tone: diff <= 7 ? "soon" : "upcoming" };
}
