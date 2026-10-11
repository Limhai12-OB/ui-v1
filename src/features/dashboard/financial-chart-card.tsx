"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import type { Transaction } from "@/types";
import { dailySeries, monthlySeries, weeklyFromDaily, type MoneyContext, type Scope, type Series, type SeriesPoint } from "@/lib/analytics";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { format, parseISO, subMonths } from "date-fns";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartSkeleton } from "@/components/shared/states";
import { ConversionNote } from "@/components/shared/money";
import { AXIS_PROPS, ChartLegend, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";

type View = "income" | "spending" | "compare";
type Range = "30d" | "90d" | "6m";

const RANGE_LABEL: Record<Range, string> = { "30d": "Last 30 days", "90d": "Last 90 days", "6m": "Last 6 months" };
const GRAIN: Record<Range, string> = { "30d": "day", "90d": "week", "6m": "month" };

function buildSeries(range: Range, txs: Transaction[], scope: Scope, ctx: MoneyContext): Series {
  const end = today();
  if (range === "30d") return dailySeries(txs, addDaysISO(end, -29), end, scope, ctx);
  // 91 days = 13 full weeks
  if (range === "90d") return weeklyFromDaily(dailySeries(txs, addDaysISO(end, -90), end, scope, ctx));
  const from = format(subMonths(parseISO(end), 5), "yyyy-MM");
  return monthlySeries(txs, from, end.slice(0, 7), scope, ctx);
}

function pointLabel(p: SeriesPoint, range: Range): string {
  if (range === "30d") return formatDate(p.key, "EEE d MMM yyyy");
  if (range === "90d") {
    const endKey = addDaysISO(p.key, 6) > today() ? today() : addDaysISO(p.key, 6);
    return `Week of ${formatDate(p.key, "d MMM")} – ${formatDate(endKey, "d MMM")}`;
  }
  const label = format(parseISO(`${p.key}-01`), "MMMM yyyy");
  return p.key === today().slice(0, 7) ? `${label} (month to date)` : label;
}

export function FinancialChartCard({ transactions, scope, money, loading }: { transactions: Transaction[]; scope: Scope; money: MoneyContext; loading: boolean }) {
  const [view, setView] = useState<View>("compare");
  const [range, setRange] = useState<Range>("6m");
  const [showTable, setShowTable] = useState(false);
  const series = useMemo(() => buildSeries(range, transactions, scope, money), [range, transactions, scope, money]);
  const cur = money.display;

  const data = useMemo(() => series.points.map((p) => ({ ...p, tick: range === "6m" ? p.label + (p.key === today().slice(0, 7) ? "*" : "") : p.label })), [series, range]);

  const summary = useMemo(() => {
    const inc = series.points.reduce((s, p) => s + p.income, 0);
    const exp = series.points.reduce((s, p) => s + p.expenses, 0);
    const pick = (k: "income" | "expenses") => series.points.reduce<SeriesPoint | undefined>((best, p) => (!best || p[k] > best[k] ? p : best), undefined);
    return { inc, exp, net: inc - exp, topInc: pick("income"), topExp: pick("expenses") };
  }, [series]);

  const summaryText = (() => {
    const r = RANGE_LABEL[range].toLowerCase();
    const peakInc = summary.topInc && summary.topInc.income > 0 ? ` Highest ${GRAIN[range]}: ${pointLabel(summary.topInc, range)} (${formatMoney(summary.topInc.income, cur)}).` : "";
    const peakExp = summary.topExp && summary.topExp.expenses > 0 ? ` Highest ${GRAIN[range]}: ${pointLabel(summary.topExp, range)} (${formatMoney(summary.topExp.expenses, cur)}).` : "";
    if (view === "income") return `Income over the ${r}: ${formatMoney(summary.inc, cur)}.${peakInc}`;
    if (view === "spending") return `Spending over the ${r}: ${formatMoney(summary.exp, cur)}.${peakExp}`;
    return `Over the ${r}, income was ${formatMoney(summary.inc, cur)} and spending ${formatMoney(summary.exp, cur)}, a net ${summary.net >= 0 ? "surplus" : "deficit"} of ${formatMoney(Math.abs(summary.net), cur)}.`;
  })();

  const empty = summary.inc === 0 && summary.exp === 0;
  const tooltip = <Tooltip cursor={{ stroke: "var(--border)", fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip currency={cur} labelFormatter={(_l, payload) => (payload?.[0]?.payload ? pointLabel(payload[0].payload as unknown as SeriesPoint, range) : _l)} />} />;
  const xAxis = <XAxis dataKey="tick" {...AXIS_PROPS} minTickGap={16} interval="preserveStartEnd" />;
  const yAxis = <YAxis {...AXIS_PROPS} width={56} tickFormatter={moneyTick(cur)} />;

  const chart = (() => {
    if (view === "compare") {
      if (range === "30d")
        return (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            {xAxis}
            {yAxis}
            {tooltip}
            <Line type="monotone" dataKey="income" name="Income" stroke={SERIES.income} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            <Line type="monotone" dataKey="expenses" name="Spending" stroke={SERIES.expenses} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
          </LineChart>
        );
      return (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid {...GRID_PROPS} />
          {xAxis}
          {yAxis}
          {tooltip}
          <Bar dataKey="income" name="Income" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expenses" name="Spending" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      );
    }
    const key = view === "income" ? "income" : "expenses";
    const color = view === "income" ? SERIES.income : SERIES.expenses;
    return (
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        {xAxis}
        {yAxis}
        {tooltip}
        <Area type="monotone" dataKey={key} name={view === "income" ? "Income" : "Spending"} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
      </AreaChart>
    );
  })();

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4 max-sm:grid-cols-1!">
        <CardTitle>Income &amp; spending</CardTitle>
        <CardDescription>Posted transactions in {cur}; transfers and items awaiting review are excluded.</CardDescription>
        <CardAction className="max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:justify-self-start max-sm:justify-start flex flex-wrap items-center justify-end gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger size="sm" className="w-52" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="30d">Last 30 days · daily</SelectItem>
              <SelectItem value="90d">Last 90 days · weekly</SelectItem>
              <SelectItem value="6m">Last 6 months · monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
            {showTable ? <BarChart3 /> : <Table2 />}
            {showTable ? "Chart" : "Table"}
          </Button>
        </CardAction>
      </CardHeader>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)} className="max-w-full overflow-x-auto">
            <TabsList>
              <TabsTrigger value="income">Income over time</TabsTrigger>
              <TabsTrigger value="spending">Spending over time</TabsTrigger>
              <TabsTrigger value="compare">Income vs spending</TabsTrigger>
            </TabsList>
          </Tabs>
          {!loading && (
            <ChartLegend
              items={view === "compare" ? [{ label: "Income", color: SERIES.income }, { label: "Spending", color: SERIES.expenses }] : view === "income" ? [{ label: "Income", color: SERIES.income }] : [{ label: "Spending", color: SERIES.expenses }]}
            />
          )}
        </div>

        {loading ? (
          <ChartSkeleton height={280} />
        ) : showTable ? (
          <div className="max-h-[320px] overflow-auto rounded-lg border">
            <Table>
              <caption className="sr-only">{`${RANGE_LABEL[range]} income and spending by ${GRAIN[range]}`}</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/40 px-3 text-xs">Period</TableHead>
                  {view !== "spending" && <TableHead className="bg-muted/40 px-3 text-right text-xs">Income</TableHead>}
                  {view !== "income" && <TableHead className="bg-muted/40 px-3 text-right text-xs">Spending</TableHead>}
                  {view === "compare" && <TableHead className="bg-muted/40 px-3 text-right text-xs">Net</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.points.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="px-3 py-2">{pointLabel(p, range)}</TableCell>
                    {view !== "spending" && <TableCell className="px-3 py-2 text-right tabular-nums">{formatMoney(p.income, cur)}</TableCell>}
                    {view !== "income" && <TableCell className="px-3 py-2 text-right tabular-nums">{formatMoney(p.expenses, cur)}</TableCell>}
                    {view === "compare" && <TableCell className={`px-3 py-2 text-right tabular-nums ${p.net < 0 ? "text-error-text" : ""}`}>{formatMoney(p.net, cur)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : empty ? (
          <div className="flex h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No posted income or spending in this period.</div>
        ) : (
          <figure aria-label={summaryText} className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </figure>
        )}

        {!loading && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {summaryText}
              {range === "6m" && " * Current month is month to date."}
            </p>
            <ConversionNote converted={series.converted} excludedForeign={series.excludedForeign} rate={money.rate} currency={cur} />
          </div>
        )}
      </div>
    </Card>
  );
}
