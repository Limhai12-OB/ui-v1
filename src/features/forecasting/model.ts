/**
 * Deterministic cash-flow forecast used in mock mode.
 *
 * Model (per series: daily revenue and daily expenses, in the display currency):
 *  1. Take the last `HISTORY_DAYS` (90) days of posted transactions in scope
 *     (`dailySeries` from `@/lib/analytics`).
 *  2. Weekday seasonality: factor[w] = mean(value on weekday w) / mean(all days).
 *  3. Linear trend: least-squares fit of the de-seasonalised values on day index.
 *  4. Expected value (P50) for future day t: (a + b·t) × factor[weekday(t)], floored at 0.
 *  5. Uncertainty: σ = standard deviation of in-sample residuals. A single day's
 *     band and a horizon total both widen with √horizon:
 *        sd_total(h) = σ · √h · √(1 + h / HISTORY_DAYS)
 *     P10 / P90 = P50 ∓ 1.2816 · sd (normal approximation), revenue/expense floored at 0.
 *  6. Cash flow: cumulative cash = current `cashPosition` + cumulative net P50,
 *     with the band from the combined revenue/expense residual spread.
 *  7. Reliability: backtest by fitting on the 90 days before the last 30 days,
 *     forecasting those 30 days and computing MAPE against actuals
 *     (weekly revenue totals; 30-day expense total). This is historical
 *     backtested accuracy — not a guarantee of future results.
 */
import type { ISODate, Transaction, FinancialAccount, Category } from "@/types";
import { cashPosition, dailySeries, expensesByCategory, type MoneyContext, type Scope } from "@/lib/analytics";
import { addDaysISO } from "@/lib/date";
import { parseISO, format } from "date-fns";

export const HISTORY_DAYS = 90;
export const MIN_HISTORY_DAYS = 30;
export const MAX_HORIZON_DAYS = 180;
const Z = 1.2816;

export interface DayPoint {
  date: ISODate;
  revenue: number;
  expenses: number;
}

export interface FittedSeries {
  a: number;
  b: number;
  season: number[]; // 0 = Sunday
  sigma: number;
  n: number;
}

function weekday(iso: ISODate) {
  return parseISO(iso).getDay();
}

export function fit(values: number[], dates: ISODate[]): FittedSeries {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / (n || 1);
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  dates.forEach((d, i) => {
    sums[weekday(d)] += values[i];
    counts[weekday(d)] += 1;
  });
  const season = sums.map((s, w) => (mean > 0 && counts[w] ? s / counts[w] / mean : 1));
  const des = values.map((v, i) => (season[weekday(dates[i])] > 0 ? v / season[weekday(dates[i])] : v));
  const xm = (n - 1) / 2;
  const ym = des.reduce((s, v) => s + v, 0) / (n || 1);
  let num = 0;
  let den = 0;
  des.forEach((y, x) => {
    num += (x - xm) * (y - ym);
    den += (x - xm) ** 2;
  });
  const b = den ? num / den : 0;
  const a = ym - b * xm;
  const resid = values.map((v, i) => v - (a + b * i) * season[weekday(dates[i])]);
  const sigma = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  return { a, b, season, sigma, n };
}

export function predict(m: FittedSeries, dates: ISODate[]): number[] {
  return dates.map((d, i) => Math.max(0, (m.a + m.b * (m.n + i)) * m.season[weekday(d)]));
}

export function horizonSd(sigma: number, h: number) {
  return sigma * Math.sqrt(h) * Math.sqrt(1 + h / HISTORY_DAYS);
}

export interface ForecastDay {
  date: ISODate;
  revenue: number;
  expenses: number;
}

export interface Range {
  p10: number;
  p50: number;
  p90: number;
}

export interface Reliability {
  level: "high" | "medium" | "low";
  revenueMape: number; // percent
  expenseError: number; // percent
  windowStart: ISODate;
  windowEnd: ISODate;
}

export interface BaselineForecast {
  asOf: ISODate;
  horizonDays: number;
  history: DayPoint[];
  days: ForecastDay[];
  revenueModel: FittedSeries;
  expenseModel: FittedSeries;
  startCash: number;
  /** Cash at each of the last 13 weekly points of history (for the cash chart). */
  cashHistory: { date: ISODate; cash: number }[];
  /** Share of expenses that are Inventory Purchases over the history window (0–1). */
  inventoryShare: number;
  reliability: Reliability;
  converted: boolean;
  excludedForeign: boolean;
}

export interface ForecastInput {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  categories: Category[];
  scope: Scope;
  money: MoneyContext;
  asOf: ISODate;
  horizonDays: number;
}

function series(input: ForecastInput, end: ISODate) {
  const start = addDaysISO(end, -(HISTORY_DAYS - 1));
  const s = dailySeries(input.transactions, start, end, input.scope, input.money);
  return { s, points: s.points.map((p) => ({ date: p.key, revenue: p.income, expenses: p.expenses })) };
}

function futureDates(from: ISODate, h: number) {
  return Array.from({ length: h }, (_, i) => addDaysISO(from, i + 1));
}

function backtest(input: ForecastInput): Reliability {
  const cutoff = addDaysISO(input.asOf, -30);
  const train = series(input, cutoff).points;
  const actual = dailySeries(input.transactions, addDaysISO(cutoff, 1), input.asOf, input.scope, input.money).points;
  const dates = actual.map((p) => p.key);
  const rm = fit(train.map((p) => p.revenue), train.map((p) => p.date));
  const em = fit(train.map((p) => p.expenses), train.map((p) => p.date));
  const rp = predict(rm, dates);
  const ep = predict(em, dates);
  // Weekly revenue buckets (daily retail revenue is noisy; owners plan by week).
  const errs: number[] = [];
  for (let i = 0; i + 7 <= dates.length; i += 7) {
    const a = actual.slice(i, i + 7).reduce((s, p) => s + p.income, 0);
    const f = rp.slice(i, i + 7).reduce((s, v) => s + v, 0);
    if (a > 0) errs.push(Math.abs(f - a) / a);
  }
  const revenueMape = errs.length ? (errs.reduce((s, e) => s + e, 0) / errs.length) * 100 : 100;
  const ae = actual.reduce((s, p) => s + p.expenses, 0);
  const fe = ep.reduce((s, v) => s + v, 0);
  const expenseError = ae > 0 ? (Math.abs(fe - ae) / ae) * 100 : 100;
  const score = Math.max(revenueMape, expenseError * 0.75);
  const level = score < 10 ? "high" : score < 20 ? "medium" : "low";
  return { level, revenueMape, expenseError, windowStart: addDaysISO(cutoff, 1), windowEnd: input.asOf };
}

export function computeBaseline(input: ForecastInput): BaselineForecast {
  const { s, points } = series(input, input.asOf);
  const dates = points.map((p) => p.date);
  const revenueModel = fit(points.map((p) => p.revenue), dates);
  const expenseModel = fit(points.map((p) => p.expenses), dates);
  const fd = futureDates(input.asOf, input.horizonDays);
  const rv = predict(revenueModel, fd);
  const ev = predict(expenseModel, fd);
  const days = fd.map((date, i) => ({ date, revenue: rv[i], expenses: ev[i] }));
  const startCash = cashPosition(input.accounts, input.transactions, input.scope, input.money, input.asOf).total.value;
  const cashHistory = Array.from({ length: 13 }, (_, i) => addDaysISO(input.asOf, -(12 - i) * 7)).map((date) => ({
    date,
    cash: cashPosition(input.accounts, input.transactions, input.scope, input.money, date).total.value,
  }));
  const cats = expensesByCategory(input.transactions, input.categories, dates[0], input.asOf, input.scope, input.money);
  const inventoryShare = (cats.find((c) => c.categoryId === "cat_cogs")?.share ?? 0) / 100;
  return {
    asOf: input.asOf,
    horizonDays: input.horizonDays,
    history: points,
    days,
    revenueModel,
    expenseModel,
    startCash,
    cashHistory,
    inventoryShare,
    reliability: backtest(input),
    converted: s.converted,
    excludedForeign: s.excludedForeign,
  };
}

/* ------------------------------------------------------------------ */
/* Scenario application                                                */
/* ------------------------------------------------------------------ */

export interface ScenarioParams {
  newBranch: { enabled: boolean; monthlyRevenue: number; monthlyCost: number; setupCost: number; openingInDays: number };
  supplierIncrease: { enabled: boolean; percent: number };
  salesDecrease: { enabled: boolean; percent: number };
}

export interface ScenarioResult {
  days: ForecastDay[];
  revenue: Range;
  expenses: Range;
  net: Range;
  endingCash: Range;
  /** Months of cash at the forecast burn rate; null when not burning cash. */
  runwayMonths: number | null;
  monthlyBurn: number;
  /** Cumulative cash per forecast day (P50) with band. */
  cash: { date: ISODate; p10: number; p50: number; p90: number }[];
}

/**
 * Apply what-if adjustments to the baseline daily P50 values. Amounts in
 * `params` are already in the display currency.
 *  - New branch: from day `openingInDays` adds monthlyRevenue/30 and monthlyCost/30 per day, plus setupCost once on opening day.
 *  - Supplier increase: expenses += expenses × inventoryShare × percent.
 *  - Sales decrease: revenue × (1 − percent).
 */
export function applyScenario(base: BaselineForecast, params: ScenarioParams | null): ScenarioResult {
  const nb = params?.newBranch;
  const days = base.days.map((d, i) => {
    let revenue = d.revenue;
    let expenses = d.expenses;
    if (params?.salesDecrease.enabled) revenue *= 1 - Math.min(100, Math.max(0, params.salesDecrease.percent)) / 100;
    if (params?.supplierIncrease.enabled) expenses += d.expenses * base.inventoryShare * (Math.max(0, params.supplierIncrease.percent) / 100);
    if (nb?.enabled && i + 1 >= Math.max(1, nb.openingInDays)) {
      revenue += Math.max(0, nb.monthlyRevenue) / 30;
      expenses += Math.max(0, nb.monthlyCost) / 30;
      if (i + 1 === Math.max(1, nb.openingInDays)) expenses += Math.max(0, nb.setupCost);
    }
    return { date: d.date, revenue, expenses };
  });
  const h = days.length;
  const rs = horizonSd(base.revenueModel.sigma, h);
  const es = horizonSd(base.expenseModel.sigma, h);
  const ns = Math.sqrt(rs * rs + es * es);
  const R = days.reduce((s, d) => s + d.revenue, 0);
  const E = days.reduce((s, d) => s + d.expenses, 0);
  const N = R - E;
  const range = (p50: number, sd: number, floor = -Infinity): Range => ({ p10: Math.max(floor, p50 - Z * sd), p50, p90: Math.max(floor, p50 + Z * sd) });
  let cum = 0;
  const netSigma = Math.sqrt(base.revenueModel.sigma ** 2 + base.expenseModel.sigma ** 2);
  const cash = days.map((d, i) => {
    cum += d.revenue - d.expenses;
    const sd = horizonSd(netSigma, i + 1);
    const p50 = base.startCash + cum;
    return { date: d.date, p50, p10: p50 - Z * sd, p90: p50 + Z * sd };
  });
  const monthlyBurn = h ? (-N / h) * 30 : 0;
  return {
    days,
    revenue: range(R, rs, 0),
    expenses: range(E, es, 0),
    net: range(N, ns),
    endingCash: range(base.startCash + N, ns),
    runwayMonths: monthlyBurn > 0 ? Math.max(0, base.startCash) / monthlyBurn : null,
    monthlyBurn,
    cash,
  };
}

/* ------------------------------------------------------------------ */
/* Chart shaping                                                       */
/* ------------------------------------------------------------------ */

export interface ChartRow {
  label: string;
  date: ISODate;
  actual?: number;
  p50?: number;
  band?: [number, number];
  forecast: boolean;
  days: number;
}

/**
 * Weekly buckets of AVERAGE DAILY value (so a partial final week isn't
 * misread as a drop). History: last 12 full weeks; forecast: the horizon.
 */
export function weeklyRows(base: BaselineForecast, result: ScenarioResult, key: "revenue" | "expenses"): ChartRow[] {
  const model = key === "revenue" ? base.revenueModel : base.expenseModel;
  const rows: ChartRow[] = [];
  const hist = base.history.slice(-84);
  for (let i = 0; i < hist.length; i += 7) {
    const c = hist.slice(i, i + 7);
    rows.push({ label: format(parseISO(c[0].date), "d MMM"), date: c[0].date, actual: c.reduce((s, p) => s + p[key], 0) / c.length, forecast: false, days: c.length });
  }
  // Join the lines at the boundary.
  const last = rows[rows.length - 1];
  if (last) {
    last.p50 = last.actual;
    last.band = [last.actual!, last.actual!];
  }
  for (let i = 0; i < result.days.length; i += 7) {
    const c = result.days.slice(i, i + 7);
    const avg = c.reduce((s, p) => s + p[key], 0) / c.length;
    const daysAhead = i + c.length;
    // Band for a weekly-average: per-day σ/√n, widened with √(weeks ahead).
    const sd = (model.sigma / Math.sqrt(c.length)) * Math.sqrt(Math.max(1, daysAhead / 7)) * Math.sqrt(1 + daysAhead / HISTORY_DAYS);
    rows.push({ label: format(parseISO(c[0].date), "d MMM"), date: c[0].date, p50: avg, band: [Math.max(0, avg - Z * sd), avg + Z * sd], forecast: true, days: c.length });
  }
  return rows;
}

export function cashRows(base: BaselineForecast, result: ScenarioResult): ChartRow[] {
  const rows: ChartRow[] = base.cashHistory.map((c) => ({ label: format(parseISO(c.date), "d MMM"), date: c.date, actual: c.cash, forecast: false, days: 1 }));
  const last = rows[rows.length - 1];
  if (last) {
    last.p50 = last.actual;
    last.band = [last.actual!, last.actual!];
  }
  for (let i = 6; i < result.cash.length; i += 7) {
    const c = result.cash[i];
    rows.push({ label: format(parseISO(c.date), "d MMM"), date: c.date, p50: c.p50, band: [c.p10, c.p90], forecast: true, days: 1 });
  }
  const end = result.cash[result.cash.length - 1];
  if (end && (result.cash.length - 1) % 7 !== 6) rows.push({ label: format(parseISO(end.date), "d MMM"), date: end.date, p50: end.p50, band: [end.p10, end.p90], forecast: true, days: 1 });
  return rows;
}
