/**
 * Builds every section of a monthly report from `@/lib/analytics`, so report
 * figures match the dashboard and the advisor. Insights and recommended
 * actions are deterministic rules over these numbers (no model involved).
 */
import type { Currency, ID } from "@/types";
import type { SeedData } from "@/data/mock/seed";
import {
  branchPerformance,
  cashPosition,
  expensesByCategory,
  monthlySeries,
  payables,
  percentChange,
  periodTotals,
  receivables,
  topSellingItems,
  type BranchPerformance,
  type CashPosition,
  type CategoryBreakdown,
  type MoneyContext,
  type PayablesSummary,
  type PeriodTotals,
  type ReceivablesSummary,
  type Scope,
  type Series,
  type TopItem,
} from "@/lib/analytics";
import { formatMonth, monthRange, previousMonth } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/currency";
import { lowStockEntries } from "@/lib/domain";
import type { ReadinessIssue } from "./readiness";

export type ReportData = Pick<SeedData, "transactions" | "categories" | "branches" | "sales" | "items" | "accounts" | "invoices" | "bills">;

export interface CategoryRow extends CategoryBreakdown {
  prev: number;
  delta: number;
}

export interface ReportFigures {
  month: string;
  start: string;
  end: string;
  currency: Currency;
  totals: PeriodTotals;
  prev: PeriodTotals;
  series: Series;
  categories: CategoryRow[];
  topItems: TopItem[];
  branches: BranchPerformance[];
  cash: CashPosition;
  receivables: ReceivablesSummary;
  payables: PayablesSummary;
}

export function historyStartMonth(data: Pick<SeedData, "transactions">): string {
  let min = "9999-99";
  for (const t of data.transactions) if (t.date.slice(0, 7) < min) min = t.date.slice(0, 7);
  return min === "9999-99" ? "2026-04" : min;
}

export function buildReport(month: string, data: ReportData, scope: Scope, ctx: MoneyContext): ReportFigures {
  const { start, end } = monthRange(month);
  const pm = previousMonth(month);
  const pr = monthRange(pm);
  let from = month;
  for (let i = 0; i < 5; i++) from = previousMonth(from);
  const hs = historyStartMonth(data);
  if (from < hs) from = hs;
  const cats = expensesByCategory(data.transactions, data.categories, start, end, scope, ctx);
  const prevCats = expensesByCategory(data.transactions, data.categories, pr.start, pr.end, scope, ctx);
  const categories: CategoryRow[] = cats.map((c) => {
    const p = prevCats.find((x) => x.categoryId === c.categoryId)?.value ?? 0;
    return { ...c, prev: p, delta: c.value - p };
  });
  for (const p of prevCats) if (!categories.some((c) => c.categoryId === p.categoryId)) categories.push({ ...p, value: 0, share: 0, prev: p.value, delta: -p.value });
  return {
    month,
    start,
    end,
    currency: ctx.display,
    totals: periodTotals(data.transactions, start, end, scope, ctx),
    prev: periodTotals(data.transactions, pr.start, pr.end, scope, ctx),
    series: monthlySeries(data.transactions, from, month, scope, ctx),
    categories,
    topItems: topSellingItems(data.sales, data.items, start, end, scope, ctx, 5),
    branches: branchPerformance(data.transactions, data.branches, start, end, scope, ctx),
    cash: cashPosition(data.accounts, data.transactions, scope, ctx, end),
    receivables: receivables(data.invoices, scope, ctx),
    payables: payables(data.bills, scope, ctx),
  };
}

export interface Insight {
  id: string;
  text: string;
  tone: "positive" | "negative" | "neutral";
}

export interface RecommendedAction {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

export function reportInsights(f: ReportFigures): Insight[] {
  const fm = (v: number) => formatMoney(v, f.currency);
  const out: Insight[] = [];
  const prevLabel = formatMonth(previousMonth(f.month));
  const rd = percentChange(f.totals.revenue.value, f.prev.revenue.value);
  const ed = percentChange(f.totals.expenses.value, f.prev.expenses.value);
  if (rd !== null) out.push({ id: "rev", tone: rd >= 0 ? "positive" : "negative", text: `Revenue ${rd >= 0 ? "grew" : "fell"} ${formatPercent(Math.abs(rd))} versus ${prevLabel}, to ${fm(f.totals.revenue.value)}.` });
  if (ed !== null) {
    const up = f.categories.filter((c) => c.delta > 0.5).sort((a, b) => b.delta - a.delta);
    const drivers = up.slice(0, 2).map((c) => `${c.name} (+${fm(c.delta)})`).join(" and ");
    out.push({
      id: "exp",
      tone: ed > (rd ?? 0) ? "negative" : "neutral",
      text: `Expenses ${ed >= 0 ? "rose" : "fell"} ${formatPercent(Math.abs(ed))} to ${fm(f.totals.expenses.value)}${ed > 0 && drivers ? `, driven mainly by ${drivers}` : ""}.`,
    });
  }
  if (f.totals.margin !== null) {
    const pm = f.prev.margin;
    const diff = pm !== null ? f.totals.margin - pm : null;
    out.push({
      id: "margin",
      tone: diff === null ? "neutral" : diff >= 0 ? "positive" : "negative",
      text: `Net profit margin was ${formatPercent(f.totals.margin)}${diff !== null ? `, ${diff >= 0 ? "up" : "down"} ${Math.abs(diff).toFixed(1)} percentage points from ${formatPercent(pm!)}` : ""}.`,
    });
  }
  if (f.branches.length > 1) {
    const best = f.branches[0];
    out.push({ id: "branch", tone: "neutral", text: `${best.name} contributed the most revenue (${fm(best.revenue)}, ${f.totals.revenue.value ? formatPercent((best.revenue / f.totals.revenue.value) * 100, 0) : "—"} of the total).` });
  }
  if (f.topItems[0]) out.push({ id: "item", tone: "neutral", text: `${f.topItems[0].name} was the best-selling item with ${fm(f.topItems[0].revenue)} in sales.` });
  if (f.categories[0] && f.categories[0].value > 0) out.push({ id: "cat", tone: "neutral", text: `${f.categories[0].name} is the largest cost at ${formatPercent(f.categories[0].share, 0)} of expenses.` });
  return out;
}

export function reportActions(f: ReportFigures, issues: ReadinessIssue[], data: Pick<SeedData, "items">, scope: Scope): RecommendedAction[] {
  const fm = (v: number) => formatMoney(v, f.currency);
  const out: RecommendedAction[] = [];
  for (const i of issues.slice(0, 2)) out.push({ id: i.key, title: i.kind === "reconciliation" ? "Finish the reconciliation" : "Categorize remaining transactions", detail: i.label + ".", href: i.href, cta: i.actionLabel });
  if (f.receivables.overdueCount) out.push({ id: "ar", title: "Follow up overdue invoices", detail: `${f.receivables.overdueCount} invoices (${fm(f.receivables.overdue.value)}) are past due.`, href: "/invoices?status=overdue", cta: "View invoices" });
  if (f.payables.overdueCount || f.payables.dueSoonCount) out.push({ id: "ap", title: "Plan upcoming bill payments", detail: `${f.payables.overdueCount} overdue and ${f.payables.dueSoonCount} due in the next 14 days.`, href: "/bills", cta: "View bills" });
  const cogs = f.categories.find((c) => c.categoryId === "cat_cogs");
  if (cogs && cogs.prev > 0 && cogs.delta / cogs.prev > 0.05) out.push({ id: "cogs", title: "Review supplier pricing", detail: `Inventory purchases rose ${formatPercent((cogs.delta / cogs.prev) * 100)}. Check recent supplier bills and consider adjusting selling prices.`, href: "/bills", cta: "Review bills" });
  const low = lowStockEntries(data.items).filter((e) => scope.branchIds.includes(e.branchId as ID));
  if (low.length) out.push({ id: "stock", title: "Restock low items", detail: `${low.length} item–branch combinations are at or below reorder level today.`, href: "/items", cta: "View items" });
  return out.slice(0, 5);
}
