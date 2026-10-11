"use client";

import type { LucideIcon } from "lucide-react";
import type { Currency, Customer, ID, LineItem } from "@/types";
import { useAppStore } from "@/store/app-store";
import { formatMoney } from "@/lib/currency";
import { formatDate, formatDateTime } from "@/lib/date";
import { lineTotal } from "@/lib/domain";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";

/** Amounts per currency side by side — never added together. */
export function CurrencyAmounts({ values, fallback = "USD", className }: { values: Record<Currency, number>; fallback?: Currency; className?: string }) {
  const parts = (["USD", "KHR"] as Currency[]).filter((c) => values[c] !== 0);
  if (parts.length === 0) return <span className={cn("tabular-nums", className)}>{formatMoney(0, fallback)}</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 tabular-nums", className)}>
      {parts.map((c, i) => (
        <span key={c} className="whitespace-nowrap">
          {i > 0 && <span className="mr-2 text-muted-foreground" aria-hidden>·</span>}
          {formatMoney(values[c], c)}
        </span>
      ))}
    </span>
  );
}

/** Business letterhead + document title used by invoice and planned purchase views. */
export function DocumentHeader({ title, number, branchId, meta }: { title: string; number: string; branchId: ID; meta: { label: string; value: React.ReactNode }[] }) {
  const business = useAppStore((s) => s.business);
  const branch = useAppStore((s) => s.branches.find((b) => b.id === branchId));
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {business.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoDataUrl} alt="" className="size-12 rounded-lg object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-semibold text-primary-foreground" aria-hidden>
            {business.name.slice(0, 1)}
          </span>
        )}
        <div className="text-sm">
          <p className="text-base font-semibold">{business.name}</p>
          {branch && <p className="text-muted-foreground">{branch.name} · {branch.address}, {branch.city}</p>}
          <p className="text-muted-foreground">{business.phone} · {business.email}</p>
        </div>
      </div>
      <div className="sm:text-right">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
        <p className="text-xl font-semibold tabular-nums">{number}</p>
        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm sm:justify-end">
          {meta.map((m) => (
            <div key={m.label} className="contents">
              <dt className="text-muted-foreground">{m.label}</dt>
              <dd className="tabular-nums sm:text-right">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function BillTo({ customer, label = "Bill to" }: { customer?: Customer; label?: string }) {
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-medium">{customer?.name ?? "Unknown customer"}</p>
      {customer?.contactName && <p className="text-muted-foreground">Attn: {customer.contactName}</p>}
      {customer?.address && <p className="text-muted-foreground">{customer.address}</p>}
      {customer && <p className="text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}

export function DocumentLines({ lines, currency }: { lines: LineItem[]; currency: Currency }) {
  const items = useAppStore((s) => s.items);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Description</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Unit price</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const item = l.itemId ? items.find((i) => i.id === l.itemId) : undefined;
            return (
              <tr key={l.id} className="border-b last:border-b-0">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{l.description}</p>
                  {item && <p className="text-xs text-muted-foreground">{item.sku} · {item.unit}</p>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity.toLocaleString("en-US")}</td>
                <td className="px-3 py-2.5 text-right"><Money amount={l.unitPrice} currency={currency} /></td>
                <td className="py-2.5 pl-3 text-right"><Money amount={lineTotal(l)} currency={currency} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TotalsRows({ rows }: { rows: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: "error" | "success" }[] }) {
  return (
    <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex items-center justify-between gap-4", r.strong && "border-t pt-2 text-base font-semibold", r.tone === "error" && "text-error-text", r.tone === "success" && "text-success-text")}>
          <dt className={cn(!r.strong && "text-muted-foreground")}>{r.label}</dt>
          <dd className="tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TimelineEvent {
  id: string;
  title: React.ReactNode;
  at?: string;
  /** Show the date only (business dates) instead of date + time. */
  dateOnly?: boolean;
  description?: React.ReactNode;
  icon: LucideIcon;
  tone?: "neutral" | "info" | "success" | "warning" | "error" | "ai";
}

const TONE: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info-light text-info-text",
  success: "bg-success-light text-success-text",
  warning: "bg-warning-light text-warning-text",
  error: "bg-error-light text-error-text",
  ai: "bg-ai-light text-ai-text",
};

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="space-y-4">
      {events.map((e, i) => {
        const Icon = e.icon;
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < events.length - 1 && <span className="absolute top-8 bottom-[-12px] left-[13px] w-px bg-border" aria-hidden />}
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", TONE[e.tone ?? "neutral"])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5 text-sm">
              <p className="font-medium">{e.title}</p>
              {e.at && <p className="text-xs text-muted-foreground tabular-nums">{e.dateOnly ? formatDate(e.at) : formatDateTime(e.at)}</p>}
              {e.description && <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Print-only CSS: hides the app chrome and prints just the element marked `data-print-root`. */
export function PrintStyles() {
  return (
    <style>{`
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  [data-print-root], [data-print-root] * { visibility: visible !important; }
  [data-print-root] { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; box-shadow: none !important; }
  [data-print-hide] { display: none !important; }
}
`}</style>
  );
}
