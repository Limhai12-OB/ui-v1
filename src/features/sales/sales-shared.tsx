"use client";

import { Banknote, CreditCard, Landmark, QrCode, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { FinancialAccount, ISODate, PaymentMethod, Sale, SaleChannel } from "@/types";
import { addDaysISO, monthRange, previousMonth, today } from "@/lib/date";
import { documentTotals } from "@/lib/domain";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const PAYMENT_META: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: "Cash", icon: Banknote },
  khqr: { label: "KHQR", icon: QrCode },
  aba_pay: { label: "ABA Pay", icon: Smartphone },
  wing: { label: "Wing", icon: Wallet },
  bank_transfer: { label: "Bank transfer", icon: Landmark },
  card: { label: "Card", icon: CreditCard },
};

export const CHANNEL_LABEL: Record<SaleChannel, string> = { walk_in: "Walk-in", wholesale: "Wholesale", shopify: "Shopify" };

export function PaymentMethodLabel({ method, className }: { method: PaymentMethod; className?: string }) {
  const m = PAYMENT_META[method];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {m.label}
    </span>
  );
}

export function saleTotal(s: Sale): number {
  return documentTotals(s.lines, s.discount, 0, s.currency).total;
}

/** Preferred receiving account for a payment method at a branch. */
export function defaultAccountFor(method: PaymentMethod, accounts: FinancialAccount[], branchId: string, currency: string): FinancialAccount | undefined {
  const list = accounts.filter((a) => a.status === "active" && a.branchId === branchId && a.currency === currency);
  if (method === "cash") return list.find((a) => a.type === "cash");
  const nonCash = list.filter((a) => a.type !== "cash");
  if (method === "wing") return nonCash.find((a) => a.provider === "Wing") ?? nonCash[0];
  if (method === "aba_pay") return nonCash.find((a) => a.provider === "ABA") ?? nonCash[0];
  return nonCash.find((a) => a.type === "bank") ?? nonCash[0];
}

/* ------------------------------------------------------------------ */
/* Date presets                                                         */
/* ------------------------------------------------------------------ */

export type DatePreset = "today" | "7d" | "30d" | "this_month" | "last_month" | "90d" | "all";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function presetRange(p: DatePreset): { start: ISODate; end: ISODate } {
  const t = today();
  switch (p) {
    case "today":
      return { start: t, end: t };
    case "7d":
      return { start: addDaysISO(t, -6), end: t };
    case "30d":
      return { start: addDaysISO(t, -29), end: t };
    case "this_month":
      return { start: `${t.slice(0, 7)}-01`, end: t };
    case "last_month":
      return monthRange(previousMonth(t.slice(0, 7)));
    case "90d":
      return { start: addDaysISO(t, -89), end: t };
    default:
      return { start: "0000-01-01", end: "9999-12-31" };
  }
}

export function DatePresetSelect({ value, onChange }: { value: DatePreset; onChange: (v: DatePreset) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DatePreset)}>
      <SelectTrigger className={cn("min-w-36", value !== "all" && "border-primary/50 bg-primary-light/40")} aria-label="Date range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATE_PRESETS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
