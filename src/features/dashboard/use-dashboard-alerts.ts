"use client";

import { useMemo } from "react";
import type { Currency } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { billStatus, billTotals, invoiceStatus, invoiceTotals, isPayable, isReceivable, lowStockEntries } from "@/lib/domain";
import { addDaysISO, daysBetween, formatDate, today } from "@/lib/date";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertKind = "invoice" | "bill" | "stock" | "review" | "reconciliation" | "till";

export interface DashboardAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  href: string;
  amount?: { value: number; currency: Currency };
  /** Number of records the alert summarises (shown as a count chip when > 1). */
  count?: number;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** "Needs attention" items derived live from the store, filtered to the user's scope. */
export function useDashboardAlerts(): DashboardAlert[] {
  const { inScope, branchId, isOwner } = useScope();
  const invoices = useAppStore((s) => s.invoices);
  const bills = useAppStore((s) => s.bills);
  const items = useAppStore((s) => s.items);
  const transactions = useAppStore((s) => s.transactions);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const tills = useAppStore((s) => s.tillSessions);
  const { customerName, branchName, accountName } = useLookups();

  return useMemo(() => {
    const now = today();
    const out: DashboardAlert[] = [];

    for (const inv of invoices) {
      if (!inScope(inv.branchId) || !isReceivable(inv) || invoiceStatus(inv) !== "overdue") continue;
      const late = daysBetween(inv.dueDate, now);
      out.push({
        id: `inv:${inv.id}`,
        kind: "invoice",
        severity: "critical",
        title: `Invoice ${inv.number} is overdue`,
        detail: `${customerName(inv.customerId)} · ${late} day${late === 1 ? "" : "s"} late`,
        href: `/invoices/${inv.id}`,
        amount: { value: invoiceTotals(inv).balance, currency: inv.currency },
      });
    }

    const soon = addDaysISO(now, 14);
    for (const b of bills) {
      if (!inScope(b.branchId) || !isPayable(b)) continue;
      const overdue = billStatus(b) === "overdue";
      if (!overdue && b.dueDate > soon) continue;
      const diff = daysBetween(now, b.dueDate);
      out.push({
        id: `bill:${b.id}`,
        kind: "bill",
        severity: overdue ? "critical" : "warning",
        title: overdue ? `Bill ${b.number} is overdue` : `Bill ${b.number} due ${diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff} days`}`,
        detail: `${b.supplier} · due ${formatDate(b.dueDate, "d MMM")}`,
        href: `/bills/${b.id}`,
        amount: { value: billTotals(b).balance, currency: b.currency },
      });
    }

    const stock = lowStockEntries(items, branchId === "all" ? undefined : branchId).filter((e) => inScope(e.branchId));
    for (const e of stock) {
      const out0 = e.qty <= 0;
      out.push({
        id: `stock:${e.item.id}:${e.branchId}`,
        kind: "stock",
        severity: out0 ? "critical" : "warning",
        title: `${out0 ? "Out of stock" : "Low stock"}: ${e.item.name}`,
        detail: `${branchName(e.branchId)} · ${e.qty} ${e.item.unit} on hand (reorder at ${e.item.reorderLevel})`,
        href: `/items/${e.item.id}`,
      });
    }

    const review = transactions.filter((t) => t.status === "needs_review" && inScope(t.branchId));
    if (review.length) {
      out.push({
        id: "review",
        kind: "review",
        severity: "warning",
        title: `${review.length} imported transaction${review.length === 1 ? "" : "s"} need review`,
        detail: "Confirm categories so they are included in reports",
        href: "/banking/uncategorized",
        count: review.length,
      });
    }

    for (const r of reconciliations) {
      if (!inScope(r.branchId)) continue;
      const acc = accountName(r.accountId);
      const period = formatDate(r.periodStart, "MMM yyyy");
      if (r.status === "in_progress") {
        const unmatched = r.lines.filter((l) => l.state === "unmatched").length;
        const disc = r.lines.filter((l) => l.state === "discrepancy").length;
        if (!unmatched && !disc) continue;
        const parts = [unmatched && `${unmatched} unmatched`, disc && `${disc} discrepanc${disc === 1 ? "y" : "ies"}`].filter(Boolean).join(", ");
        out.push({ id: `rec:${r.id}`, kind: "reconciliation", severity: disc ? "critical" : "warning", title: `Reconciliation issues – ${acc}`, detail: `${period} · ${parts}`, href: `/reconciliation/${r.id}`, count: unmatched + disc });
      } else if (r.status === "submitted") {
        out.push({ id: `rec:${r.id}`, kind: "reconciliation", severity: "info", title: `Reconciliation awaiting sign-off – ${acc}`, detail: `${period} · ${isOwner ? "Review and sign off" : "Waiting for the business owner"}`, href: `/reconciliation/${r.id}` });
      } else if (r.status === "returned") {
        out.push({ id: `rec:${r.id}`, kind: "reconciliation", severity: "critical", title: `Reconciliation returned – ${acc}`, detail: `${period} · ${r.reviewNote ?? "Corrections requested"}`, href: `/reconciliation/${r.id}` });
      }
    }

    for (const t of tills) {
      if (!inScope(t.branchId)) continue;
      const label = `${branchName(t.branchId)} · ${formatDate(t.date, "d MMM")}`;
      if (t.status === "submitted") {
        const diff = t.countedUSD - t.expectedUSD;
        const variance = Math.abs(diff) >= 0.01 ? ` · ${diff < 0 ? "short" : "over"} $${Math.abs(diff).toFixed(2)}` : "";
        out.push({ id: `till:${t.id}`, kind: "till", severity: "info", title: "Till count awaiting sign-off", detail: `${label}${variance}`, href: `/till-balancing/${t.id}` });
      } else if (t.status === "returned") {
        out.push({ id: `till:${t.id}`, kind: "till", severity: "critical", title: "Till count returned for correction", detail: `${label} · ${t.reviewNote ?? "Recount requested"}`, href: `/till-balancing/${t.id}` });
      }
    }

    return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [invoices, bills, items, transactions, reconciliations, tills, inScope, branchId, isOwner, customerName, branchName, accountName]);
}
