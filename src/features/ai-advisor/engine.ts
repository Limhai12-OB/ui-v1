/**
 * Deterministic answer engine for the AI Financial Advisor (mock mode).
 *
 * The advisor is READ-ONLY. It never creates, modifies or deletes records.
 * Every figure comes from `@/lib/analytics` / `@/lib/domain` over the same
 * store data the rest of the app shows, so answers agree with the dashboard,
 * reports and lists. Questions are matched to a small set of intents
 * (English + a few Khmer keywords). In live mode the FastAPI advisor endpoint
 * replaces this module (see `lib/api/services/ai.ts`).
 */
import type { AdvisorBlock, AdvisorMessage, Currency, ID, ISODate } from "@/types";
import type { SeedData } from "@/data/mock/seed";
import {
  branchPerformance,
  businessHealth,
  cashPosition,
  currentPeriods,
  dailySeries,
  expensesByCategory,
  isExpense,
  monthlySeries,
  payables,
  percentChange,
  periodTotals,
  receivables,
  topExpenses,
  topSellingItems,
  type ConvertedSum,
  type MoneyContext,
  type Scope,
} from "@/lib/analytics";
import { billStatus, billTotals, invoiceStatus, invoiceTotals, lowStockEntries, stockLevel } from "@/lib/domain";
import { addDaysISO, daysBetween, formatDate, formatMonth, monthRange, previousMonth } from "@/lib/date";
import { convert, formatMoney, formatNumber, formatPercent, rateLabel } from "@/lib/currency";

export type AdvisorData = Pick<
  SeedData,
  "transactions" | "categories" | "branches" | "invoices" | "bills" | "items" | "sales" | "accounts" | "customers" | "reports"
>;

export interface AdvisorContext {
  data: AdvisorData;
  scope: Scope;
  /** Human label for the scope, e.g. "All branches" or "Toul Kork". */
  scopeLabel: string;
  /** True when more than one branch is in scope. */
  multiBranch: boolean;
  money: MoneyContext;
  asOf: ISODate;
}

export type AdvisorAnswer = Pick<AdvisorMessage, "content" | "blocks" | "followUps" | "references">;

export type Intent =
  | "modify"
  | "help"
  | "expense_increase"
  | "top_expenses"
  | "compare_months"
  | "branch_performance"
  | "overdue_invoices"
  | "bills"
  | "cash_position"
  | "low_stock"
  | "best_sellers"
  | "profit"
  | "health"
  | "expenses"
  | "revenue"
  | "unknown";

export const SUGGESTED_QUESTIONS = [
  "How much revenue did we make this month?",
  "Which branch performed best?",
  "Why did expenses increase?",
  "Show the five highest expenses.",
  "Compare this month with last month.",
  "Which invoices are overdue?",
  "What is our cash position?",
  "Which items are low on stock?",
  "What are our best-selling items?",
];

/* ------------------------------------------------------------------ */
/* Intent matching                                                     */
/* ------------------------------------------------------------------ */

const has = (q: string, re: RegExp) => re.test(q);

const MODIFY_RE =
  /^(?:please\s+|pls\s+|can you\s+|could you\s+|would you\s+|i want to\s+|i need to\s+|i'd like to\s+|help me\s+|go ahead and\s+)?(?:delete|remove|create|add|make|change|update|edit|record|post|pay|send|cancel|void|approve|sign off|categori[sz]e|rename|move|transfer|issue|write off|mark|adjust|reconcile|refund|book)\b/;
const MODIFY_KM = /(លុប|បង្កើត|កែប្រែ|កែ|ផ្លាស់ប្តូរ|បញ្ចូល)/;

export function matchIntent(raw: string): Intent {
  const q = raw.toLowerCase().trim();
  if (!q) return "unknown";
  if (has(q, MODIFY_RE) || has(raw, MODIFY_KM)) return "modify";
  if (has(q, /^(hi|hello|hey|help|what can you do|សួស្តី)\b/) || q === "?") return "help";
  const expenseWord = /(expense|cost|spend|spending|ចំណាយ)/;
  if (has(q, /\bwhy\b|reason|driv|what caused|ហេតុអ្វី/) && (has(q, expenseWord) || has(raw, /ចំណាយ/)) && has(q, /(increase|up\b|higher|rise|rising|grow|jump|more|កើន)/)) return "expense_increase";
  if (has(raw, /ចំណាយ/) && has(raw, /កើន/)) return "expense_increase";
  if (has(q, /(highest|largest|biggest|top|five|5|ten|10)/) && has(q, expenseWord)) return "top_expenses";
  if (has(q, /(compare|comparison|versus|\bvs\.?\b|against last month|ប្រៀបធៀប)/)) return "compare_months";
  if (has(q, /(branch|branches|store|stores|location|សាខា)/)) return "branch_performance";
  if (has(q, /(\bbills?\b|payable|we owe)/)) return "bills";
  if (has(q, /(overdue|unpaid|receivable|owe us|owes us|outstanding invoice|late invoice|invoice)/) || has(raw, /វិក្កយបត្រ/)) return "overdue_invoices";
  if (has(q, /(bill|bills|payable|supplier.*due|due soon|we owe)/)) return "bills";
  if (has(q, /(cash|balance|bank|liquidity|runway|money do we have|សាច់ប្រាក់)/)) return "cash_position";
  if (has(q, /(low stock|stock|inventory|reorder|out of stock|ស្តុក)/)) return "low_stock";
  if (has(q, /(best[- ]?sell|top[- ]sell|sell(s|ing)? (the )?most|popular|top (items|products)|best items|best products)/)) return "best_sellers";
  if (has(q, /(health|score|how are we doing|how is the business)/)) return "health";
  if (has(q, /(profit|margin|net income|bottom line|ចំណេញ)/)) return "profit";
  if (has(q, expenseWord)) return "expenses";
  if (has(q, /(revenue|sales|income|earn|made|turnover|sell|ចំណូល|លក់)/)) return "revenue";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

interface Period {
  start: ISODate;
  end: ISODate;
  label: string;
  /** Comparison period of equal shape. */
  prevStart: ISODate;
  prevEnd: ISODate;
  prevLabel: string;
  mtd: boolean;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function rangeLabel(start: ISODate, end: ISODate) {
  return start.slice(0, 7) === end.slice(0, 7) ? `${formatDate(start, "d")}–${formatDate(end, "d MMM yyyy")}` : `${formatDate(start, "d MMM")}–${formatDate(end, "d MMM yyyy")}`;
}

function mtdPeriod(asOf: ISODate): Period {
  const p = currentPeriods(asOf);
  return { start: p.start, end: p.end, label: `this month (${rangeLabel(p.start, p.end)})`, prevStart: p.prevStart, prevEnd: p.prevEnd, prevLabel: `the same days last month (${rangeLabel(p.prevStart, p.prevEnd)})`, mtd: true };
}

function fullMonthPeriod(month: string): Period {
  const r = monthRange(month);
  const pm = previousMonth(month);
  const pr = monthRange(pm);
  return { start: r.start, end: r.end, label: formatMonth(month), prevStart: pr.start, prevEnd: pr.end, prevLabel: formatMonth(pm), mtd: false };
}

function parsePeriod(raw: string, asOf: ISODate): Period {
  const q = raw.toLowerCase();
  const current = asOf.slice(0, 7);
  if (/(last|previous|prior) month|ខែមុន/.test(raw.toLowerCase())) return fullMonthPeriod(previousMonth(current));
  const year = asOf.slice(0, 4);
  for (let i = 0; i < MONTHS.length; i++) {
    if (new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      if (m === current) return mtdPeriod(asOf);
      if (m < current) return fullMonthPeriod(m);
    }
  }
  return mtdPeriod(asOf);
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function makeFmt(ctx: AdvisorContext) {
  const cur: Currency = ctx.money.display;
  const fm = (v: number) => formatMoney(v, cur);
  const fs = (s: ConvertedSum) => `${s.converted ? "≈" : ""}${fm(s.value)}`;
  const pct = (cur0: number, prev: number) => {
    const c = percentChange(cur0, prev);
    return c === null ? "n/a" : formatPercent(c, 1, true);
  };
  return { cur, fm, fs, pct };
}

function currencyNote(ctx: AdvisorContext, converted: boolean, excluded: boolean): string {
  if (converted) return ` Amounts in the other currency are converted at the configured rate (${rateLabel(ctx.money.rate)}).`;
  if (excluded) return ` Amounts in the other currency are excluded because no conversion rate is configured.`;
  return "";
}

function scopeLine(ctx: AdvisorContext, extra?: string) {
  return `_Scope: ${ctx.scopeLabel} · ${ctx.money.display} · data through ${formatDate(ctx.asOf)}${extra ? ` · ${extra}` : ""}_`;
}

function reportRef(ctx: AdvisorContext, month: string) {
  const r = ctx.data.reports.find((x) => x.month === month);
  return r ? [{ label: `${formatMonth(month)} report`, href: `/reports/${r.id}` }] : [];
}

function tone(delta: number | null, invert = false): "positive" | "negative" | "neutral" {
  if (delta === null || Math.abs(delta) < 0.05) return "neutral";
  const good = invert ? delta < 0 : delta > 0;
  return good ? "positive" : "negative";
}

/* ------------------------------------------------------------------ */
/* Intent handlers                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_FOLLOWUPS = ["Why did expenses increase?", "Which branch performed best?", "What is our cash position?"];

function refusal(raw: string): AdvisorAnswer {
  const q = raw.toLowerCase();
  const routes: { re: RegExp; label: string; href: string }[] = [
    { re: /invoice|វិក្កយបត្រ/, label: "Invoices", href: /create|make|new|issue|បង្កើត/.test(q) ? "/invoices/new" : "/invoices" },
    { re: /\bbills?\b|supplier/, label: "Bills", href: /create|make|new|add|record/.test(q) ? "/bills/new" : "/bills" },
    { re: /expense/, label: "New expense", href: "/transactions/new?type=expense" },
    { re: /income|revenue|sale/, label: "Transactions", href: "/transactions" },
    { re: /transaction|payment|transfer/, label: "Transactions", href: /create|add|record|new|transfer/.test(q) ? "/transactions/new" : "/transactions" },
    { re: /categor/, label: "Categories", href: "/categories" },
    { re: /customer/, label: "Customers", href: "/customers" },
    { re: /item|product|stock|inventory/, label: "Items", href: "/items" },
    { re: /reconcil/, label: "Reconciliation", href: "/reconciliation" },
    { re: /branch/, label: "Branches", href: "/branches" },
    { re: /account|bank/, label: "Accounts", href: "/accounts" },
  ];
  const match = routes.find((r) => r.re.test(q));
  const refs = match ? [{ label: `Open ${match.label}`, href: match.href }] : [{ label: "Transactions", href: "/transactions" }];
  return {
    content: [
      "I can't make changes — the AI Financial Advisor is **read-only**. It can analyze and explain your financial data, but it never creates, edits or deletes records.",
      match ? `You can do this yourself on the **${match.label}** page, where every change is reviewed and confirmed by you.` : "You can make changes from the relevant page in the app, where every change is reviewed and confirmed by you.",
    ].join("\n\n"),
    references: refs,
    followUps: DEFAULT_FOLLOWUPS,
  };
}

function help(ctx: AdvisorContext): AdvisorAnswer {
  return {
    content: [
      `I can answer questions about your financial data for **${ctx.scopeLabel}**, using the same figures shown on the dashboard and in reports. For example:`,
      "- Revenue, expenses and profit for this month or a past month",
      "- Why expenses changed, by category",
      "- The highest individual expenses",
      "- Branch comparison and best-performing branch",
      "- Overdue invoices and upcoming bills",
      "- Cash position across accounts",
      "- Low-stock and best-selling items",
      "- Overall business health",
      "I'm read-only: I can't create, edit or delete records.",
    ].join("\n"),
    followUps: SUGGESTED_QUESTIONS.slice(0, 4),
  };
}

function unknown(ctx: AdvisorContext): AdvisorAnswer {
  const h = help(ctx);
  return { ...h, content: `I don't have an answer for that yet. In this demo I can answer a fixed set of financial questions:\n${h.content.split("\n").slice(1).join("\n")}` };
}

function revenue(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs, pct, cur } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  const t = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  const prev = periodTotals(ctx.data.transactions, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  const delta = percentChange(t.revenue.value, prev.revenue.value);
  const days = daysBetween(p.start, p.end) + 1;
  const cs = dailySeries(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  const ps = dailySeries(ctx.data.transactions, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  const line: AdvisorBlock = {
    kind: "line",
    title: "Daily revenue",
    series: [p.mtd ? "This month" : p.label, p.mtd ? "Last month" : p.prevLabel],
    currency: cur,
    data: cs.points.map((pt, i) => ({ label: `Day ${i + 1}`, a: pt.income, b: ps.points[i]?.income })),
  };
  const dir = delta === null ? "" : delta >= 0 ? `up ${formatPercent(delta, 1)}` : `down ${formatPercent(Math.abs(delta), 1)}`;
  return {
    content: [
      `Revenue for ${p.label} is **${fs(t.revenue)}** across ${days} days (${fm(t.revenue.value / days)} per day on average)${dir ? `, ${dir} on ${p.prevLabel} (${fs(prev.revenue)})` : ""}.`,
      `Expenses over the same period were ${fs(t.expenses)}, leaving a net of **${fm(t.net)}**${t.margin !== null ? ` (${formatPercent(t.margin)} margin)` : ""}.` + currencyNote(ctx, t.converted, t.excludedForeign),
      "Revenue here is posted income on a cash basis; transactions still awaiting review are not included.",
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [
      {
        kind: "kpis",
        items: [
          { label: "Revenue", value: fs(t.revenue), delta: `${pct(t.revenue.value, prev.revenue.value)} vs ${p.mtd ? "last month" : formatMonth(p.prevStart.slice(0, 7))}`, tone: tone(delta) },
          { label: "Expenses", value: fs(t.expenses), delta: `${pct(t.expenses.value, prev.expenses.value)}`, tone: tone(percentChange(t.expenses.value, prev.expenses.value), true) },
          { label: "Net", value: fm(t.net), delta: t.margin !== null ? `${formatPercent(t.margin)} margin` : undefined, tone: t.net >= 0 ? "positive" : "negative" },
        ],
      },
      line,
    ],
    references: [{ label: "Income transactions", href: "/transactions" }, ...reportRef(ctx, previousMonth(ctx.asOf.slice(0, 7)))],
    followUps: ["Compare this month with last month.", "Which branch performed best?", "What are our best-selling items?"],
  };
}

function expenses(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs, pct, cur } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  const t = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  const prev = periodTotals(ctx.data.transactions, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  const cats = expensesByCategory(ctx.data.transactions, ctx.data.categories, p.start, p.end, ctx.scope, ctx.money);
  return {
    content: [
      `Expenses for ${p.label} total **${fs(t.expenses)}**, ${pct(t.expenses.value, prev.expenses.value)} versus ${p.prevLabel} (${fs(prev.expenses)}).`,
      cats.length ? `The largest category is **${cats[0].name}** at ${fm(cats[0].value)} (${formatPercent(cats[0].share)} of expenses).` : "There are no posted expenses in this period.",
      currencyNote(ctx, t.converted, t.excludedForeign).trim(),
      scopeLine(ctx),
    ].filter(Boolean).join("\n\n"),
    blocks: cats.length
      ? [{ kind: "bar", title: `Expenses by category — ${p.label}`, currency: cur, data: cats.slice(0, 8).map((c) => ({ label: c.name, value: c.value })) }]
      : undefined,
    references: [{ label: "Expense transactions", href: "/transactions" }],
    followUps: ["Why did expenses increase?", "Show the five highest expenses.", "Compare this month with last month."],
  };
}

interface CatDelta {
  id: string;
  name: string;
  prev: number;
  cur: number;
  delta: number;
}

function categoryDeltas(ctx: AdvisorContext, start: ISODate, end: ISODate, prevStart: ISODate, prevEnd: ISODate): CatDelta[] {
  const a = expensesByCategory(ctx.data.transactions, ctx.data.categories, start, end, ctx.scope, ctx.money);
  const b = expensesByCategory(ctx.data.transactions, ctx.data.categories, prevStart, prevEnd, ctx.scope, ctx.money);
  const ids = new Set([...a.map((x) => x.categoryId), ...b.map((x) => x.categoryId)]);
  return [...ids]
    .map((id) => {
      const ca = a.find((x) => x.categoryId === id);
      const cb = b.find((x) => x.categoryId === id);
      const cur = ca?.value ?? 0;
      const prev = cb?.value ?? 0;
      return { id, name: ca?.name ?? cb?.name ?? "Uncategorized", cur, prev, delta: cur - prev };
    })
    .sort((x, y) => y.delta - x.delta);
}

/** Expense descriptions that appear in a category this period but not in the comparison period. */
function newDrivers(ctx: AdvisorContext, categoryId: ID, start: ISODate, end: ISODate, prevStart: ISODate, prevEnd: ISODate) {
  const inCat = (s: ISODate, e: ISODate) =>
    ctx.data.transactions.filter((t) => isExpense(t) && t.categoryId === categoryId && t.date >= s && t.date <= e && ctx.scope.branchIds.includes(t.branchId));
  const prevDesc = new Set(inCat(prevStart, prevEnd).map((t) => t.description));
  const groups = new Map<string, { total: number; count: number; firstId: ID }>();
  for (const t of inCat(start, end)) {
    if (prevDesc.has(t.description)) continue;
    const v = t.currency === ctx.money.display ? t.amount : convert(t.amount, t.currency, ctx.money.display, ctx.money.rate);
    if (v === null) continue;
    const g = groups.get(t.description) ?? { total: 0, count: 0, firstId: t.id };
    g.total += v;
    g.count += 1;
    groups.set(t.description, g);
  }
  return [...groups.entries()].map(([description, g]) => ({ description, ...g })).sort((a, b) => b.total - a.total);
}

function expenseIncrease(ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs, pct, cur } = makeFmt(ctx);
  const curMonth = ctx.asOf.slice(0, 7);
  const lastFull = previousMonth(curMonth);
  const full = fullMonthPeriod(lastFull);
  const mtd = mtdPeriod(ctx.asOf);
  const tFull = periodTotals(ctx.data.transactions, full.start, full.end, ctx.scope, ctx.money);
  const pFull = periodTotals(ctx.data.transactions, full.prevStart, full.prevEnd, ctx.scope, ctx.money);
  const tMtd = periodTotals(ctx.data.transactions, mtd.start, mtd.end, ctx.scope, ctx.money);
  const pMtd = periodTotals(ctx.data.transactions, mtd.prevStart, mtd.prevEnd, ctx.scope, ctx.money);
  const deltas = categoryDeltas(ctx, full.start, full.end, full.prevStart, full.prevEnd);
  const ups = deltas.filter((d) => d.delta > 0.5);
  const totalDelta = tFull.expenses.value - pFull.expenses.value;
  const mtdDeltas = categoryDeltas(ctx, mtd.start, mtd.end, mtd.prevStart, mtd.prevEnd).filter((d) => d.delta > 0.5);

  const refs: { label: string; href: string }[] = [];
  const driverLines: string[] = [];
  for (const d of ups.slice(0, 3)) {
    const drivers = d.id === "uncategorized" ? [] : newDrivers(ctx, d.id, full.start, full.end, full.prevStart, full.prevEnd).slice(0, 2);
    const share = totalDelta > 0 ? ` — ${formatPercent((d.delta / totalDelta) * 100, 0)} of the increase` : "";
    let line = `- **${d.name}**: ${fm(d.prev)} → ${fm(d.cur)} (${fm(d.delta).replace(/^/, "+")}, ${pct(d.cur, d.prev)})${share}.`;
    if (drivers.length) {
      line += ` New this month: ${drivers.map((x) => `“${x.description}” (${x.count > 1 ? `${x.count} payments, ` : ""}${fm(x.total)})`).join("; ")}.`;
      for (const x of drivers) refs.push({ label: x.description, href: `/transactions/${x.firstId}` });
    } else if (d.id === "cat_cogs") {
      const priceBill = ctx.data.bills.find((b) => b.categoryId === "cat_cogs" && /price/i.test(b.description) && b.issueDate >= full.start && b.issueDate <= full.end && ctx.scope.branchIds.includes(b.branchId));
      if (priceBill) {
        line += ` Supplier bill ${priceBill.number} (“${priceBill.description}”) reflects a new supplier price list.`;
        refs.push({ label: `Bill ${priceBill.number}`, href: `/bills/${priceBill.id}` });
      } else line += " The same suppliers were paid more for stock this month.";
    }
    driverLines.push(line);
  }

  const content: string[] = [];
  if (totalDelta > 0) {
    content.push(
      `Expenses rose **${pct(tFull.expenses.value, pFull.expenses.value)}** in ${full.label} — ${fs(tFull.expenses)} versus ${fs(pFull.expenses)} in ${full.prevLabel} (${fm(totalDelta).replace(/^/, "+")}). The increase comes mainly from:`,
    );
    content.push(driverLines.join("\n"));
  } else {
    content.push(`Expenses did not increase in ${full.label}: ${fs(tFull.expenses)} versus ${fs(pFull.expenses)} in ${full.prevLabel} (${pct(tFull.expenses.value, pFull.expenses.value)}).`);
    if (driverLines.length) content.push(`Categories that still went up:\n${driverLines.join("\n")}`);
  }
  const mtdDelta = percentChange(tMtd.expenses.value, pMtd.expenses.value);
  content.push(
    `**Month to date** (${rangeLabel(mtd.start, mtd.end)}), expenses are ${fs(tMtd.expenses)}, ${mtdDelta === null ? "with no comparison available" : `${mtdDelta >= 0 ? "up" : "down"} ${formatPercent(Math.abs(mtdDelta), 1)} on the same days of last month (${fs(pMtd.expenses)})`}${mtdDeltas.length ? `; the biggest increases so far are ${mtdDeltas.slice(0, 3).map((d) => `${d.name} (+${fm(d.delta)})`).join(", ")}` : ""}.`,
  );
  const note = currencyNote(ctx, tFull.converted || tMtd.converted, tFull.excludedForeign || tMtd.excludedForeign).trim();
  if (note) content.push(note);
  content.push(scopeLine(ctx));

  const rows = deltas
    .filter((d) => d.cur > 0 || d.prev > 0)
    .slice(0, 8)
    .map((d) => [d.name, fm(d.prev), fm(d.cur), `${d.delta >= 0 ? "+" : ""}${fm(d.delta)}`, pct(d.cur, d.prev)]);

  return {
    content: content.join("\n\n"),
    blocks: [
      { kind: "table", columns: ["Category", full.prevLabel, full.label, "Change", "%"], rows },
      ...(ups.length ? [{ kind: "bar" as const, title: `Increase by category — ${full.label} vs ${full.prevLabel}`, currency: cur, data: ups.slice(0, 6).map((d) => ({ label: d.name, value: Math.round(d.delta * 100) / 100 })) }] : []),
    ],
    references: [...reportRef(ctx, lastFull), ...refs.slice(0, 4), { label: "All transactions", href: "/transactions" }],
    followUps: ["Show the five highest expenses.", "Compare this month with last month.", "Which branch performed best?"],
  };
}

function topExpensesAnswer(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  const n = /\b(ten|10)\b/.test(raw.toLowerCase()) ? 10 : 5;
  const list = topExpenses(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money, n);
  const catName = (id?: ID) => ctx.data.categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const brName = (id: ID) => ctx.data.branches.find((b) => b.id === id)?.name ?? "—";
  if (!list.length) return { content: `There are no posted expenses for ${p.label}.\n\n${scopeLine(ctx)}`, followUps: DEFAULT_FOLLOWUPS };
  const anyConverted = list.some((x) => x.tx.currency !== ctx.money.display);
  const total = list.reduce((s, x) => s + x.display, 0);
  const all = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  return {
    content: [
      `The ${list.length} highest expenses for ${p.label} add up to **${anyConverted ? "≈" : ""}${fm(total)}**${all.expenses.value ? ` — ${formatPercent((total / all.expenses.value) * 100)} of all expenses in the period` : ""}. The largest is “${list[0].tx.description}” (${catName(list[0].tx.categoryId)}, ${brName(list[0].tx.branchId)}).`,
      anyConverted ? `Amounts recorded in the other currency are shown in their original currency with the converted value used for ranking (${rateLabel(ctx.money.rate)}).` : "",
      scopeLine(ctx),
    ].filter(Boolean).join("\n\n"),
    blocks: [
      {
        kind: "table",
        columns: ["Date", "Description", "Category", "Branch", "Amount"],
        rows: list.map((x) => [
          formatDate(x.tx.date, "d MMM"),
          x.tx.description,
          catName(x.tx.categoryId),
          brName(x.tx.branchId),
          x.tx.currency === ctx.money.display ? fm(x.display) : `${formatMoney(x.tx.amount, x.tx.currency)} (≈${fm(x.display)})`,
        ]),
      },
    ],
    references: list.map((x) => ({ label: x.tx.description, href: `/transactions/${x.tx.id}` })),
    followUps: ["Why did expenses increase?", "Show the five highest expenses last month.", "Compare this month with last month."],
  };
}

function compare(ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs, pct, cur } = makeFmt(ctx);
  const p = mtdPeriod(ctx.asOf);
  const t = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  const prev = periodTotals(ctx.data.transactions, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  const prevFull = fullMonthPeriod(previousMonth(ctx.asOf.slice(0, 7)));
  const full = periodTotals(ctx.data.transactions, prevFull.start, prevFull.end, ctx.scope, ctx.money);
  const rd = percentChange(t.revenue.value, prev.revenue.value);
  const ed = percentChange(t.expenses.value, prev.expenses.value);
  const marginPts = t.margin !== null && prev.margin !== null ? t.margin - prev.margin : null;
  const days = daysBetween(p.start, p.end) + 1;
  const series = monthlySeries(ctx.data.transactions, previousMonth(previousMonth(previousMonth(previousMonth(previousMonth(ctx.asOf.slice(0, 7)))))), ctx.asOf.slice(0, 7), ctx.scope, ctx.money);
  return {
    content: [
      `Comparing like-for-like days — ${rangeLabel(p.start, p.end)} against ${rangeLabel(p.prevStart, p.prevEnd)}:`,
      [
        `- Revenue: **${fs(t.revenue)}** vs ${fs(prev.revenue)} (${pct(t.revenue.value, prev.revenue.value)})`,
        `- Expenses: **${fs(t.expenses)}** vs ${fs(prev.expenses)} (${pct(t.expenses.value, prev.expenses.value)})`,
        `- Net: **${fm(t.net)}** vs ${fm(prev.net)}`,
        `- Margin: ${t.margin !== null ? formatPercent(t.margin) : "n/a"} vs ${prev.margin !== null ? formatPercent(prev.margin) : "n/a"}${marginPts !== null ? ` (${marginPts >= 0 ? "+" : "−"}${Math.abs(marginPts).toFixed(1)} pts)` : ""}`,
      ].join("\n"),
      `For reference, ${prevFull.label} as a full month closed with revenue of ${fs(full.revenue)} and expenses of ${fs(full.expenses)}. October has ${days} days of data so far, so month totals are not directly comparable yet.` +
        currencyNote(ctx, t.converted || full.converted, t.excludedForeign || full.excludedForeign),
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [
      {
        kind: "kpis",
        items: [
          { label: "Revenue (MTD)", value: fs(t.revenue), delta: `${pct(t.revenue.value, prev.revenue.value)} vs last month`, tone: tone(rd) },
          { label: "Expenses (MTD)", value: fs(t.expenses), delta: `${pct(t.expenses.value, prev.expenses.value)} vs last month`, tone: tone(ed, true) },
          { label: "Net (MTD)", value: fm(t.net), delta: `vs ${fm(prev.net)}`, tone: t.net >= prev.net ? "positive" : "negative" },
        ],
      },
      {
        kind: "line",
        title: "Monthly revenue and expenses (October is month to date)",
        series: ["Revenue", "Expenses"],
        currency: cur,
        data: series.points.map((pt) => ({ label: pt.label, a: pt.income, b: pt.expenses })),
      },
    ],
    references: [...reportRef(ctx, prevFull.start.slice(0, 7)), { label: "Transactions", href: "/transactions" }],
    followUps: ["Why did expenses increase?", "Which branch performed best?", "What is our profit margin?"],
  };
}

function branchesAnswer(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm, cur } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  if (!ctx.multiBranch) {
    const t = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
    return {
      content: `Your current scope is a single branch (**${ctx.scopeLabel}**), so I can't rank branches. For ${p.label}, ${ctx.scopeLabel} had revenue of **${fm(t.revenue.value)}**, expenses of ${fm(t.expenses.value)} and a net of ${fm(t.net)}${t.margin !== null ? ` (${formatPercent(t.margin)} margin)` : ""}.\n\n${scopeLine(ctx)}`,
      followUps: ["Compare this month with last month.", "Why did expenses increase?"],
      references: [{ label: "Transactions", href: "/transactions" }],
    };
  }
  const perf = branchPerformance(ctx.data.transactions, ctx.data.branches, p.start, p.end, ctx.scope, ctx.money);
  const prevPerf = branchPerformance(ctx.data.transactions, ctx.data.branches, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  const byNet = [...perf].sort((a, b) => b.net - a.net);
  const best = perf[0];
  const bestMargin = [...perf].filter((b) => b.margin !== null && b.revenue > 0).sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0];
  const newBranches = ctx.data.branches.filter((b) => ctx.scope.branchIds.includes(b.id) && b.openedAt > p.prevStart);
  const growth = perf
    .map((b) => ({ b, d: percentChange(b.revenue, prevPerf.find((x) => x.branchId === b.branchId)?.revenue ?? 0) }))
    .filter((x) => x.d !== null)
    .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))[0];
  return {
    content: [
      `For ${p.label}, **${best.name}** performed best by revenue with ${fm(best.revenue)} and a net of ${fm(best.net)}${best.margin !== null ? ` (${formatPercent(best.margin)} margin)` : ""}.`,
      [
        byNet[0].branchId !== best.branchId ? `- Highest net profit: ${byNet[0].name} (${fm(byNet[0].net)}).` : "",
        bestMargin && bestMargin.branchId !== best.branchId ? `- Best margin: ${bestMargin.name} (${formatPercent(bestMargin.margin!)}).` : "",
        growth ? `- Fastest revenue growth vs ${p.prevLabel}: ${growth.b.name} (${formatPercent(growth.d!, 1, true)}).` : "",
        ...newBranches.map((b) => `- ${b.name} opened on ${formatDate(b.openedAt)}, so it has limited history and isn't directly comparable.`),
      ].filter(Boolean).join("\n"),
      scopeLine(ctx),
    ].filter(Boolean).join("\n\n"),
    blocks: [
      {
        kind: "table",
        columns: ["Branch", "Revenue", "Expenses", "Net", "Margin"],
        rows: perf.map((b) => [b.name, fm(b.revenue), fm(b.expenses), fm(b.net), b.margin !== null ? formatPercent(b.margin) : "—"]),
      },
      { kind: "bar", title: `Revenue by branch — ${p.label}`, currency: cur, data: perf.map((b) => ({ label: b.name, value: b.revenue })) },
    ],
    references: [...reportRef(ctx, previousMonth(ctx.asOf.slice(0, 7))), { label: "Transactions", href: "/transactions" }],
    followUps: ["Which branch performed best last month?", "Why did expenses increase?", "What are our best-selling items?"],
  };
}

function overdue(ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs } = makeFmt(ctx);
  const ar = receivables(ctx.data.invoices, ctx.scope, ctx.money);
  const list = ar.invoices.filter((i) => invoiceStatus(i, ctx.asOf) === "overdue").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const cust = (id: ID) => ctx.data.customers.find((c) => c.id === id)?.name ?? "—";
  if (!list.length) {
    return {
      content: `No invoices are overdue. ${ar.count} open invoice${ar.count === 1 ? "" : "s"} totalling ${fs(ar.total)} ${ar.count === 1 ? "is" : "are"} still within terms.\n\n${scopeLine(ctx)}`,
      references: [{ label: "Invoices", href: "/invoices" }],
      followUps: ["What is our cash position?", "Which bills are due soon?"],
    };
  }
  return {
    content: [
      `**${list.length} invoice${list.length === 1 ? " is" : "s are"} overdue**, totalling ${fs(ar.overdue)} — out of ${fs(ar.total)} outstanding across ${ar.count} open invoices. The oldest is ${list[0].number} for ${cust(list[0].customerId)}, ${daysBetween(list[0].dueDate, ctx.asOf)} days past due.`,
      "Following up on the oldest balances first usually has the biggest effect on cash." + currencyNote(ctx, ar.overdue.converted, ar.overdue.excludedForeign),
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [
      {
        kind: "table",
        columns: ["Invoice", "Customer", "Due", "Days overdue", "Balance"],
        rows: list.map((i) => [i.number, cust(i.customerId), formatDate(i.dueDate, "d MMM"), daysBetween(i.dueDate, ctx.asOf), formatMoney(invoiceTotals(i).balance, i.currency)]),
      },
    ],
    references: [{ label: "Overdue invoices", href: "/invoices?status=overdue" }, ...list.slice(0, 4).map((i) => ({ label: i.number, href: `/invoices/${i.id}` }))],
    followUps: ["What is our cash position?", "Which bills are due soon?", "How much revenue did we make this month?"],
  };
}

function billsAnswer(ctx: AdvisorContext): AdvisorAnswer {
  const { fs } = makeFmt(ctx);
  const ap = payables(ctx.data.bills, ctx.scope, ctx.money, ctx.asOf);
  const soon = addDaysISO(ctx.asOf, 14);
  const list = ap.bills.filter((b) => billStatus(b, ctx.asOf) === "overdue" || b.dueDate <= soon).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    content: [
      `You have ${ap.count} unpaid bill${ap.count === 1 ? "" : "s"} totalling **${fs(ap.total)}**. ${ap.overdueCount ? `**${ap.overdueCount} overdue** (${fs(ap.overdue)})` : "None are overdue"}, and ${ap.dueSoonCount} more (${fs(ap.dueSoon)}) are due in the next 14 days.` +
        currencyNote(ctx, ap.total.converted, ap.total.excludedForeign),
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: list.length
      ? [
          {
            kind: "table",
            columns: ["Bill", "Supplier", "Due", "Status", "Balance"],
            rows: list.map((b) => [b.number, b.supplier, formatDate(b.dueDate, "d MMM"), billStatus(b, ctx.asOf) === "overdue" ? "Overdue" : "Due soon", formatMoney(billTotals(b).balance, b.currency)]),
          },
        ]
      : undefined,
    references: [{ label: "Bills", href: "/bills" }, ...list.slice(0, 3).map((b) => ({ label: b.number, href: `/bills/${b.id}` }))],
    followUps: ["What is our cash position?", "Which invoices are overdue?"],
  };
}

function cash(ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs } = makeFmt(ctx);
  const cp = cashPosition(ctx.data.accounts, ctx.data.transactions, ctx.scope, ctx.money, ctx.asOf);
  const last90 = periodTotals(ctx.data.transactions, addDaysISO(ctx.asOf, -89), ctx.asOf, ctx.scope, ctx.money);
  const monthlyExp = last90.expenses.value / 3;
  const cover = monthlyExp > 0 ? cp.total.value / monthlyExp : null;
  const ar = receivables(ctx.data.invoices, ctx.scope, ctx.money);
  const ap = payables(ctx.data.bills, ctx.scope, ctx.money, ctx.asOf);
  const typeLabel = { bank: "Bank", cash: "Cash", ewallet: "E-wallet" } as const;
  return {
    content: [
      `Your cash position is **${fs(cp.total)}** across ${cp.byAccount.length} active accounts, as of ${formatDate(ctx.asOf)}.`,
      cover !== null ? `At the average monthly spend of the last 90 days (${fm(monthlyExp)}), that covers about **${cover.toFixed(1)} months** of expenses.` : "",
      `Open receivables are ${fs(ar.total)} and unpaid bills ${fs(ap.total)}, so the net position after collecting and paying all open items would be about ${fm(cp.total.value + ar.total.value - ap.total.value)}.` +
        currencyNote(ctx, cp.total.converted, cp.total.excludedForeign),
      scopeLine(ctx),
    ].filter(Boolean).join("\n\n"),
    blocks: [
      {
        kind: "kpis",
        items: [
          { label: "Cash & bank", value: fs(cp.total), tone: "neutral" },
          { label: "Receivables", value: fs(ar.total), delta: `${ar.overdueCount} overdue`, tone: ar.overdueCount ? "negative" : "neutral" },
          { label: "Payables", value: fs(ap.total), delta: `${ap.overdueCount} overdue`, tone: ap.overdueCount ? "negative" : "neutral" },
        ],
      },
      {
        kind: "table",
        columns: ["Account", "Type", "Balance"],
        rows: [...cp.byAccount].sort((a, b) => b.balance - a.balance).map((a) => [a.account.name, typeLabel[a.account.type], formatMoney(a.balance, a.account.currency)]),
      },
    ],
    references: [{ label: "Banking overview", href: "/banking" }, { label: "Accounts", href: "/accounts" }],
    followUps: ["Which invoices are overdue?", "Which bills are due soon?", "How healthy is the business?"],
  };
}

function lowStock(ctx: AdvisorContext): AdvisorAnswer {
  const entries = lowStockEntries(ctx.data.items)
    .filter((e) => ctx.scope.branchIds.includes(e.branchId))
    .sort((a, b) => a.qty - b.qty);
  const brName = (id: ID) => ctx.data.branches.find((b) => b.id === id)?.name ?? "—";
  if (!entries.length) return { content: `All active items are above their reorder levels.\n\n${scopeLine(ctx)}`, references: [{ label: "Items", href: "/items" }], followUps: DEFAULT_FOLLOWUPS };
  const out = entries.filter((e) => e.qty <= 0).length;
  return {
    content: [
      `**${entries.length} item–branch combinations** are at or below their reorder level${out ? `, including **${out} out of stock**` : ""}.`,
      "Restock decisions and stock adjustments are made on the Items page — I can't change stock.",
      scopeLine(ctx, "current stock levels"),
    ].join("\n\n"),
    blocks: [
      {
        kind: "table",
        columns: ["Item", "Branch", "On hand", "Reorder level", "Status"],
        rows: entries.slice(0, 12).map((e) => [e.item.name, brName(e.branchId), `${formatNumber(e.qty)} ${e.item.unit}`, formatNumber(e.item.reorderLevel), stockLevel(e.qty, e.item.reorderLevel) === "out" ? "Out of stock" : "Low stock"]),
      },
    ],
    references: [{ label: "Items", href: "/items" }, ...entries.slice(0, 3).map((e) => ({ label: e.item.name, href: `/items/${e.item.id}` }))],
    followUps: ["What are our best-selling items?", "What is our cash position?"],
  };
}

function bestSellers(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm, cur } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  const top = topSellingItems(ctx.data.sales, ctx.data.items, p.start, p.end, ctx.scope, ctx.money, 5);
  if (!top.length) return { content: `No item sales are recorded for ${p.label}.\n\n${scopeLine(ctx)}`, followUps: DEFAULT_FOLLOWUPS };
  return {
    content: [
      `The best-selling item for ${p.label} is **${top[0].name}** with ${fm(top[0].revenue)} from ${formatNumber(top[0].quantity)} units sold.`,
      "Figures cover itemized sales (walk-in, POS and online orders); wholesale invoice lines without an item are not included.",
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [
      { kind: "table", columns: ["Item", "SKU", "Units", "Revenue"], rows: top.map((t) => [t.name, t.sku, formatNumber(t.quantity), fm(t.revenue)]) },
      { kind: "bar", title: `Top items by revenue — ${p.label}`, currency: cur, data: top.map((t) => ({ label: t.name, value: t.revenue })) },
    ],
    references: [{ label: "Item sales", href: "/item-sales" }, ...top.slice(0, 3).map((t) => ({ label: t.name, href: `/items/${t.itemId}` }))],
    followUps: ["Which items are low on stock?", "How much revenue did we make this month?"],
  };
}

function profit(raw: string, ctx: AdvisorContext): AdvisorAnswer {
  const { fm, fs } = makeFmt(ctx);
  const p = parsePeriod(raw, ctx.asOf);
  const t = periodTotals(ctx.data.transactions, p.start, p.end, ctx.scope, ctx.money);
  const prev = periodTotals(ctx.data.transactions, p.prevStart, p.prevEnd, ctx.scope, ctx.money);
  return {
    content: [
      `Net profit for ${p.label} is **${fm(t.net)}** on revenue of ${fs(t.revenue)}${t.margin !== null ? `, a **${formatPercent(t.margin)} margin**` : ""}. For ${p.prevLabel} it was ${fm(prev.net)}${prev.margin !== null ? ` (${formatPercent(prev.margin)})` : ""}.`,
      "This is cash-basis profit: posted income minus posted expenses, excluding transfers and items awaiting review." + currencyNote(ctx, t.converted, t.excludedForeign),
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [
      {
        kind: "kpis",
        items: [
          { label: "Revenue", value: fs(t.revenue), tone: "neutral" },
          { label: "Expenses", value: fs(t.expenses), tone: "neutral" },
          { label: "Net profit", value: fm(t.net), delta: t.margin !== null ? `${formatPercent(t.margin)} margin` : undefined, tone: t.net >= 0 ? "positive" : "negative" },
        ],
      },
    ],
    references: reportRef(ctx, previousMonth(ctx.asOf.slice(0, 7))),
    followUps: ["Why did expenses increase?", "Which branch performed best?"],
  };
}

function health(ctx: AdvisorContext): AdvisorAnswer {
  const h = businessHealth(ctx.data, ctx.scope, ctx.money, ctx.asOf);
  const label = { good: "Good", fair: "Fair", poor: "Needs attention" } as const;
  const weakest = [...h.factors].sort((a, b) => a.score - b.score)[0];
  return {
    content: [
      `The business health score is **${h.overall}/100 (${label[h.status]})**. The weakest factor is **${weakest.label}** (${weakest.score}/100): ${weakest.detail}`,
      "The score is a rule-based summary of liquidity, profitability, cash-flow trend, receivables, payables and expense control over the last 90 days — the same score shown on the dashboard.",
      scopeLine(ctx),
    ].join("\n\n"),
    blocks: [{ kind: "table", columns: ["Factor", "Score", "Status", "Detail"], rows: h.factors.map((f) => [f.label, f.score, label[f.status], f.detail]) }],
    references: [{ label: "Dashboard", href: "/dashboard" }],
    followUps: ["Why did expenses increase?", "What is our cash position?"],
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function answerQuestion(question: string, ctx: AdvisorContext): AdvisorAnswer {
  const intent = matchIntent(question);
  switch (intent) {
    case "modify":
      return refusal(question);
    case "help":
      return help(ctx);
    case "expense_increase":
      return expenseIncrease(ctx);
    case "top_expenses":
      return topExpensesAnswer(question, ctx);
    case "compare_months":
      return compare(ctx);
    case "branch_performance":
      return branchesAnswer(question, ctx);
    case "overdue_invoices":
      return overdue(ctx);
    case "bills":
      return billsAnswer(ctx);
    case "cash_position":
      return cash(ctx);
    case "low_stock":
      return lowStock(ctx);
    case "best_sellers":
      return bestSellers(question, ctx);
    case "profit":
      return profit(question, ctx);
    case "health":
      return health(ctx);
    case "expenses":
      return expenses(question, ctx);
    case "revenue":
      return revenue(question, ctx);
    default:
      return unknown(ctx);
  }
}

/** Short conversation title from the first question. */
export function titleFromQuestion(q: string): string {
  const t = q.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  return t.length > 48 ? `${t.slice(0, 46)}…` : t || "New conversation";
}
