/**
 * Shared financial analytics. Dashboard, Monthly Reports, the AI Advisor and
 * Forecasting all use these functions so every view reports the same numbers.
 *
 * Basis: cash basis — revenue = posted income transactions, expenses = posted
 * expense transactions (transfers excluded). Transactions awaiting review are
 * excluded until categorized.
 *
 * Currency: amounts in a different currency from the display currency are
 * converted ONLY with the configured rate; results carry `converted` so the UI
 * labels them. With no rate, foreign-currency amounts are excluded and
 * `excludedForeign` is set so the UI can say so.
 */
import type { Bill, Branch, Category, Currency, FinancialAccount, ID, Invoice, ISODate, Item, Sale, Transaction } from "@/types";
import { convert, roundMoney } from "@/lib/currency";
import { accountBalance, billTotals, invoiceStatus, invoiceTotals, isPayable, isReceivable, billStatus } from "@/lib/domain";
import { addDaysISO, daysBetween, monthRange, previousMonth, today } from "@/lib/date";
import { eachDayOfInterval, eachMonthOfInterval, format, parseISO } from "date-fns";

export interface MoneyContext {
  display: Currency;
  rate: number | null;
}

export interface Scope {
  /** Branch ids included. */
  branchIds: ID[];
}

export interface ConvertedSum {
  value: number;
  converted: boolean;
  excludedForeign: boolean;
}

function emptySum(): ConvertedSum {
  return { value: 0, converted: false, excludedForeign: false };
}

function addTo(sum: ConvertedSum, amount: number, currency: Currency, ctx: MoneyContext) {
  if (currency === ctx.display) {
    sum.value += amount;
    return;
  }
  const c = convert(amount, currency, ctx.display, ctx.rate);
  if (c === null) sum.excludedForeign = true;
  else {
    sum.value += c;
    sum.converted = true;
  }
}

function finish(sum: ConvertedSum, ctx: MoneyContext): ConvertedSum {
  return { ...sum, value: roundMoney(sum.value, ctx.display) };
}

const inScope = (scope: Scope, branchId: ID) => scope.branchIds.includes(branchId);

export function isRevenue(t: Transaction): boolean {
  return t.type === "income" && t.status === "posted";
}
export function isExpense(t: Transaction): boolean {
  return t.type === "expense" && t.status === "posted";
}

export interface PeriodTotals {
  revenue: ConvertedSum;
  expenses: ConvertedSum;
  net: number;
  /** Percent; null when revenue is 0. */
  margin: number | null;
  converted: boolean;
  excludedForeign: boolean;
}

export function periodTotals(txs: Transaction[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext): PeriodTotals {
  const revenue = emptySum();
  const expenses = emptySum();
  for (const t of txs) {
    if (t.date < start || t.date > end || !inScope(scope, t.branchId)) continue;
    if (isRevenue(t)) addTo(revenue, t.amount, t.currency, ctx);
    else if (isExpense(t)) addTo(expenses, t.amount, t.currency, ctx);
  }
  const r = finish(revenue, ctx);
  const e = finish(expenses, ctx);
  const net = roundMoney(r.value - e.value, ctx.display);
  return {
    revenue: r,
    expenses: e,
    net,
    margin: r.value > 0 ? (net / r.value) * 100 : null,
    converted: r.converted || e.converted,
    excludedForeign: r.excludedForeign || e.excludedForeign,
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Month-to-date for the current demo month and the same day-range of last month. */
export function currentPeriods(asOf = today()) {
  const month = asOf.slice(0, 7);
  const start = `${month}-01`;
  const dayCount = daysBetween(start, asOf);
  const prevMonth = previousMonth(month);
  const prevStart = `${prevMonth}-01`;
  const prevRange = monthRange(prevMonth);
  const prevEndCandidate = addDaysISO(prevStart, dayCount);
  const prevEnd = prevEndCandidate > prevRange.end ? prevRange.end : prevEndCandidate;
  return { month, start, end: asOf, prevMonth, prevStart, prevEnd };
}

export interface SeriesPoint {
  key: string; // yyyy-MM or yyyy-MM-dd
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface Series {
  points: SeriesPoint[];
  converted: boolean;
  excludedForeign: boolean;
}

export function monthlySeries(txs: Transaction[], fromMonth: string, toMonth: string, scope: Scope, ctx: MoneyContext): Series {
  const months = eachMonthOfInterval({ start: parseISO(`${fromMonth}-01`), end: parseISO(`${toMonth}-01`) }).map((d) => format(d, "yyyy-MM"));
  const map = new Map(months.map((m) => [m, { inc: emptySum(), exp: emptySum() }]));
  for (const t of txs) {
    if (!inScope(scope, t.branchId)) continue;
    const bucket = map.get(t.date.slice(0, 7));
    if (!bucket) continue;
    if (isRevenue(t)) addTo(bucket.inc, t.amount, t.currency, ctx);
    else if (isExpense(t)) addTo(bucket.exp, t.amount, t.currency, ctx);
  }
  let converted = false;
  let excludedForeign = false;
  const points = months.map((m) => {
    const b = map.get(m)!;
    converted ||= b.inc.converted || b.exp.converted;
    excludedForeign ||= b.inc.excludedForeign || b.exp.excludedForeign;
    const income = roundMoney(b.inc.value, ctx.display);
    const expenses = roundMoney(b.exp.value, ctx.display);
    return { key: m, label: format(parseISO(`${m}-01`), "MMM"), income, expenses, net: roundMoney(income - expenses, ctx.display) };
  });
  return { points, converted, excludedForeign };
}

export function dailySeries(txs: Transaction[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext): Series {
  const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => format(d, "yyyy-MM-dd"));
  const map = new Map(days.map((d) => [d, { inc: emptySum(), exp: emptySum() }]));
  for (const t of txs) {
    if (!inScope(scope, t.branchId)) continue;
    const bucket = map.get(t.date);
    if (!bucket) continue;
    if (isRevenue(t)) addTo(bucket.inc, t.amount, t.currency, ctx);
    else if (isExpense(t)) addTo(bucket.exp, t.amount, t.currency, ctx);
  }
  let converted = false;
  let excludedForeign = false;
  const points = days.map((d) => {
    const b = map.get(d)!;
    converted ||= b.inc.converted || b.exp.converted;
    excludedForeign ||= b.inc.excludedForeign || b.exp.excludedForeign;
    const income = roundMoney(b.inc.value, ctx.display);
    const expenses = roundMoney(b.exp.value, ctx.display);
    return { key: d, label: format(parseISO(d), "d MMM"), income, expenses, net: roundMoney(income - expenses, ctx.display) };
  });
  return { points, converted, excludedForeign };
}

/** Group a daily series into weeks (for 90-day views). */
export function weeklyFromDaily(series: Series): Series {
  const points: SeriesPoint[] = [];
  for (let i = 0; i < series.points.length; i += 7) {
    const chunk = series.points.slice(i, i + 7);
    const income = chunk.reduce((s, p) => s + p.income, 0);
    const expenses = chunk.reduce((s, p) => s + p.expenses, 0);
    points.push({ key: chunk[0].key, label: chunk[0].label, income, expenses, net: income - expenses });
  }
  return { ...series, points };
}

export interface CategoryBreakdown {
  categoryId: ID | "uncategorized";
  name: string;
  value: number;
  share: number; // 0-100
}

export function expensesByCategory(txs: Transaction[], categories: Category[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext): CategoryBreakdown[] {
  const sums = new Map<string, ConvertedSum>();
  for (const t of txs) {
    if (!isExpense(t) || t.date < start || t.date > end || !inScope(scope, t.branchId)) continue;
    const key = t.categoryId ?? "uncategorized";
    if (!sums.has(key)) sums.set(key, emptySum());
    addTo(sums.get(key)!, t.amount, t.currency, ctx);
  }
  const total = [...sums.values()].reduce((s, v) => s + v.value, 0);
  return [...sums.entries()]
    .map(([id, v]) => ({
      categoryId: id,
      name: categories.find((c) => c.id === id)?.name ?? "Uncategorized",
      value: roundMoney(v.value, ctx.display),
      share: total ? (v.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface BranchPerformance {
  branchId: ID;
  name: string;
  revenue: number;
  expenses: number;
  net: number;
  margin: number | null;
}

export function branchPerformance(txs: Transaction[], branches: Branch[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext): BranchPerformance[] {
  return branches
    .filter((b) => inScope(scope, b.id))
    .map((b) => {
      const p = periodTotals(txs, start, end, { branchIds: [b.id] }, ctx);
      return { branchId: b.id, name: b.name, revenue: p.revenue.value, expenses: p.expenses.value, net: p.net, margin: p.margin };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface TopItem {
  itemId: ID;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
}

export function topSellingItems(sales: Sale[], items: Item[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext, limit = 5): TopItem[] {
  const map = new Map<ID, { q: number; r: ConvertedSum }>();
  for (const s of sales) {
    if (s.date < start || s.date > end || !inScope(scope, s.branchId)) continue;
    for (const l of s.lines) {
      if (!l.itemId) continue;
      if (!map.has(l.itemId)) map.set(l.itemId, { q: 0, r: emptySum() });
      const m = map.get(l.itemId)!;
      m.q += l.quantity;
      addTo(m.r, l.quantity * l.unitPrice, s.currency, ctx);
    }
  }
  return [...map.entries()]
    .map(([itemId, v]) => {
      const it = items.find((i) => i.id === itemId);
      return { itemId, name: it?.name ?? "Unknown item", sku: it?.sku ?? "", quantity: v.q, revenue: roundMoney(v.r.value, ctx.display) };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function topExpenses(txs: Transaction[], start: ISODate, end: ISODate, scope: Scope, ctx: MoneyContext, limit = 5) {
  return txs
    .filter((t) => isExpense(t) && t.date >= start && t.date <= end && inScope(scope, t.branchId))
    .map((t) => ({ tx: t, display: t.currency === ctx.display ? t.amount : convert(t.amount, t.currency, ctx.display, ctx.rate) }))
    .filter((x): x is { tx: Transaction; display: number } => x.display !== null)
    .sort((a, b) => b.display - a.display)
    .slice(0, limit);
}

export interface ReceivablesSummary {
  total: ConvertedSum;
  overdue: ConvertedSum;
  count: number;
  overdueCount: number;
  invoices: Invoice[];
}

export function receivables(invoices: Invoice[], scope: Scope, ctx: MoneyContext): ReceivablesSummary {
  const total = emptySum();
  const overdue = emptySum();
  const list = invoices.filter((i) => inScope(scope, i.branchId) && isReceivable(i));
  let overdueCount = 0;
  for (const inv of list) {
    const bal = invoiceTotals(inv).balance;
    addTo(total, bal, inv.currency, ctx);
    if (invoiceStatus(inv) === "overdue") {
      overdueCount++;
      addTo(overdue, bal, inv.currency, ctx);
    }
  }
  return { total: finish(total, ctx), overdue: finish(overdue, ctx), count: list.length, overdueCount, invoices: list };
}

export interface PayablesSummary {
  total: ConvertedSum;
  overdue: ConvertedSum;
  dueSoon: ConvertedSum;
  count: number;
  overdueCount: number;
  dueSoonCount: number;
  bills: Bill[];
}

export function payables(bills: Bill[], scope: Scope, ctx: MoneyContext, asOf = today(), soonDays = 14): PayablesSummary {
  const total = emptySum();
  const overdue = emptySum();
  const dueSoon = emptySum();
  const list = bills.filter((b) => inScope(scope, b.branchId) && isPayable(b));
  let overdueCount = 0;
  let dueSoonCount = 0;
  const soon = addDaysISO(asOf, soonDays);
  for (const b of list) {
    const bal = billTotals(b).balance;
    addTo(total, bal, b.currency, ctx);
    if (billStatus(b) === "overdue") {
      overdueCount++;
      addTo(overdue, bal, b.currency, ctx);
    } else if (b.dueDate <= soon) {
      dueSoonCount++;
      addTo(dueSoon, bal, b.currency, ctx);
    }
  }
  return { total: finish(total, ctx), overdue: finish(overdue, ctx), dueSoon: finish(dueSoon, ctx), count: list.length, overdueCount, dueSoonCount, bills: list };
}

export interface CashPosition {
  total: ConvertedSum;
  byAccount: { account: FinancialAccount; balance: number }[];
}

export function cashPosition(accounts: FinancialAccount[], txs: Transaction[], scope: Scope, ctx: MoneyContext, asOf = today()): CashPosition {
  const total = emptySum();
  const byAccount = accounts
    .filter((a) => a.status === "active" && inScope(scope, a.branchId))
    .map((account) => {
      const balance = accountBalance(account, txs, asOf);
      addTo(total, balance, account.currency, ctx);
      return { account, balance };
    });
  return { total: finish(total, ctx), byAccount };
}

/* ------------------------------------------------------------------ */
/* Business health                                                     */
/* ------------------------------------------------------------------ */

export interface HealthFactor {
  id: "liquidity" | "profitability" | "cashflow" | "receivables" | "payables" | "expenses";
  label: string;
  score: number; // 0-100
  status: "good" | "fair" | "poor";
  detail: string;
}

export interface HealthScore {
  overall: number;
  status: "good" | "fair" | "poor";
  factors: HealthFactor[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const statusOf = (n: number): HealthFactor["status"] => (n >= 70 ? "good" : n >= 45 ? "fair" : "poor");

export function businessHealth(
  data: { transactions: Transaction[]; accounts: FinancialAccount[]; invoices: Invoice[]; bills: Bill[] },
  scope: Scope,
  ctx: MoneyContext,
  asOf = today(),
): HealthScore {
  const fmt = (n: number) => `${ctx.display === "USD" ? "$" : "៛"}${Math.round(n).toLocaleString("en-US")}`;
  // Trailing 90 days split into three 30-day windows
  const w = [0, 1, 2].map((i) => {
    const end = addDaysISO(asOf, -30 * i);
    const start = addDaysISO(end, -29);
    return periodTotals(data.transactions, start, end, scope, ctx);
  });
  const monthlyExpense = (w[0].expenses.value + w[1].expenses.value + w[2].expenses.value) / 3 || 1;
  const cash = cashPosition(data.accounts, data.transactions, scope, ctx, asOf).total.value;
  const monthsCover = cash / monthlyExpense;
  const liquidity = clamp((monthsCover / 2) * 100);

  const margin = w[0].margin ?? 0;
  const profitability = clamp((margin / 20) * 100);

  const trend = [w[2].net, w[1].net, w[0].net];
  const improving = trend[2] >= trend[1];
  const cashflow = clamp(50 + (trend[2] > 0 ? 25 : -25) + (improving ? 20 : -10));

  const ar = receivables(data.invoices, scope, ctx);
  const overdueShare = ar.total.value ? ar.overdue.value / ar.total.value : 0;
  const recScore = clamp(100 - overdueShare * 100);

  const ap = payables(data.bills, scope, ctx, asOf);
  const apOverdueShare = ap.total.value ? ap.overdue.value / ap.total.value : 0;
  const payScore = clamp(100 - apOverdueShare * 120);

  const expGrowth = percentChange(w[0].expenses.value, w[1].expenses.value) ?? 0;
  const revGrowth = percentChange(w[0].revenue.value, w[1].revenue.value) ?? 0;
  const expenseControl = clamp(75 - (expGrowth - revGrowth) * 4);

  const factors: HealthFactor[] = [
    { id: "liquidity", label: "Cash & liquidity", score: liquidity, status: statusOf(liquidity), detail: `${monthsCover.toFixed(1)} months of expenses covered by ${fmt(cash)} in accounts.` },
    { id: "profitability", label: "Profitability", score: profitability, status: statusOf(profitability), detail: `${margin.toFixed(1)}% net margin over the last 30 days (target 20%).` },
    { id: "cashflow", label: "Cash flow trend", score: cashflow, status: statusOf(cashflow), detail: `Net cash flow ${improving ? "improved" : "declined"} versus the previous 30 days (${fmt(trend[2])} vs ${fmt(trend[1])}).` },
    { id: "receivables", label: "Receivables", score: recScore, status: statusOf(recScore), detail: `${ar.overdueCount} of ${ar.count} open invoices overdue (${fmt(ar.overdue.value)}).` },
    { id: "payables", label: "Payables", score: payScore, status: statusOf(payScore), detail: `${ap.overdueCount} overdue bills; ${ap.dueSoonCount} due in the next 14 days.` },
    { id: "expenses", label: "Expense control", score: expenseControl, status: statusOf(expenseControl), detail: `Expenses ${expGrowth >= 0 ? "up" : "down"} ${Math.abs(expGrowth).toFixed(1)}% vs revenue ${revGrowth >= 0 ? "up" : "down"} ${Math.abs(revGrowth).toFixed(1)}% (30-day windows).` },
  ];
  const weights = { liquidity: 0.2, profitability: 0.25, cashflow: 0.15, receivables: 0.15, payables: 0.1, expenses: 0.15 };
  const overall = clamp(factors.reduce((s, f) => s + f.score * weights[f.id], 0));
  return { overall, status: statusOf(overall), factors };
}

/** Number of distinct days with sales revenue in scope — used to gate forecasts. */
export function salesHistoryDays(txs: Transaction[], scope: Scope): number {
  const days = new Set<string>();
  for (const t of txs) if (isRevenue(t) && inScope(scope, t.branchId)) days.add(t.date);
  return days.size;
}
