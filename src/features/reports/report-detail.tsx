"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileBarChart, Lightbulb, Loader2, RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Currency } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { percentChange, type ConvertedSum } from "@/lib/analytics";
import { convert, formatMoney, formatPercent, rateLabel } from "@/lib/currency";
import { formatDate, formatDateTime, formatMonth, previousMonth, today } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConvertedMoney, ConversionNote, Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat";
import { AIBadge, DemoNotice } from "@/components/shared/demo-notice";
import { CardsSkeleton, ChartSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { AXIS_PROPS, ChartLegend, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/use-t";
import { cn } from "@/lib/utils";
import { buildReport, reportActions, reportInsights, type ReportFigures } from "./report-data";
import { reportReadiness } from "./readiness";
import { buildReportCsv, downloadCsv, ExportDialog, type CurrencyView, type SectionId } from "./export-dialog";
import { GenerateReportDialog } from "./generate-report-dialog";

type Figs = Partial<Record<Currency, ReportFigures>>;

const ACCOUNT_TYPE = { bank: "Bank", cash: "Cash", ewallet: "E-wallet" } as const;

export function ReportDetail({ id }: { id: string }) {
  const t = useT();
  const loading = useInitialLoad();
  const report = useAppStore((s) => s.reports.find((r) => r.id === id));
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const branchesAll = useAppStore((s) => s.branches);
  const sales = useAppStore((s) => s.sales);
  const items = useAppStore((s) => s.items);
  const accounts = useAppStore((s) => s.accounts);
  const invoices = useAppStore((s) => s.invoices);
  const bills = useAppStore((s) => s.bills);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const { scope, money, branch } = useScope();
  const canGenerate = useCan("reports.generate");
  const rate = money.rate;
  const [viewState, setView] = useState<CurrencyView | null>(null);
  const view: CurrencyView = viewState ?? (money.display === "KHR" && rate ? "KHR" : "USD");
  const [exportOpen, setExportOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [printSections, setPrintSections] = useState<SectionId[] | null>(null);

  const curs: Currency[] = view === "dual" ? ["USD", "KHR"] : [view];
  const scopeLabel = branch ? branch.name : "All branches";

  const figs: Figs = useMemo(() => {
    if (!report) return {};
    const data = { transactions, categories, branches: branchesAll, sales, items, accounts, invoices, bills };
    const out: Figs = { USD: buildReport(report.month, data, scope, { display: "USD", rate }) };
    if (rate) out.KHR = buildReport(report.month, data, scope, { display: "KHR", rate });
    return out;
  }, [report, transactions, categories, branchesAll, sales, items, accounts, invoices, bills, scope, rate]);

  const issues = useMemo(() => (report ? reportReadiness(report.month, { accounts, reconciliations, transactions }, scope) : []), [report, accounts, reconciliations, transactions, scope]);

  if (!report) {
    return (
      <EmptyState
        icon={FileBarChart}
        title="Report not found"
        description="This report doesn't exist or hasn't been generated yet."
        action={<Button asChild><Link href="/reports">Back to reports</Link></Button>}
      />
    );
  }

  const primary = figs[curs[0]]!;
  const insights = reportInsights(primary);
  const actions = reportActions(primary, issues, { items }, scope);
  const show = (s: SectionId) => !printSections || printSections.includes(s);
  const sectionCls = (s: SectionId) => cn(!show(s) && "print:hidden");

  const doPrint = (v: CurrencyView, sections: SectionId[]) => {
    setView(v);
    setPrintSections(sections);
    setTimeout(() => {
      window.print();
      setPrintSections(null);
    }, 350);
  };
  const doCsv = (v: CurrencyView, sections: SectionId[]) => {
    const csv = buildReportCsv(figs, v, sections, { report, scopeLabel, rate, insights: insights.map((i) => i.text), actions: actions.map((a) => `${a.title}: ${a.detail}`) });
    downloadCsv(`ledgervision-report-${report.month}${v === "dual" ? "-usd-khr" : `-${v.toLowerCase()}`}.csv`, csv);
  };

  const anyConverted = curs.some((c) => figs[c]!.totals.converted || figs[c]!.cash.total.converted);
  const anyExcluded = curs.some((c) => figs[c]!.totals.excludedForeign);
  const Note = ({ className }: { className?: string }) =>
    curs.length === 1 ? (
      <ConversionNote converted={anyConverted} excludedForeign={anyExcluded} rate={rate} currency={curs[0]} className={className} />
    ) : (
      <p className={cn("text-xs text-muted-foreground", className)}>Dual view: each column totals both currencies; amounts recorded in the other currency are converted at the configured rate {rateLabel(rate)} (marked ≈).</p>
    );

  const sumCell = (get: (f: ReportFigures) => ConvertedSum, c: Currency, className?: string) => <ConvertedMoney sum={get(figs[c]!)} currency={c} rate={rate} className={className} />;

  const generating = report.status === "generating";

  return (
    <>
      <style>{`@media print { aside, header.sticky, [data-print-hide] { display: none !important; } main { max-width: none !important; padding: 0 !important; } body { background: white; } .print-avoid { break-inside: avoid; } }`}</style>
      <PageHeader
        backHref="/reports"
        backLabel="Monthly Reports"
        title={`${formatMonth(report.month)} report`}
        meta={<StatusBadge status={report.status} label={report.status === "incomplete" ? `Incomplete · ${issues.length || report.missing.length} item${(issues.length || report.missing.length) === 1 ? "" : "s"}` : undefined} />}
        description={
          <>
            {scopeLabel} · cash basis · generated {report.generatedAt ? formatDateTime(report.generatedAt) : "—"}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2" data-print-hide>
            <UITooltip>
              <TooltipTrigger asChild>
                <span>
                  <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as CurrencyView)} aria-label="Currency view">
                    <ToggleGroupItem value="USD">USD</ToggleGroupItem>
                    <ToggleGroupItem value="KHR" disabled={!rate}>KHR</ToggleGroupItem>
                    <ToggleGroupItem value="dual" disabled={!rate}>Dual</ToggleGroupItem>
                  </ToggleGroup>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-xs">{rate ? `Converted values use ${rateLabel(rate)}.` : "KHR and dual views need a conversion rate. Configure one in Settings."}</TooltipContent>
            </UITooltip>
            {canGenerate && report.status !== "complete" && (
              <Button variant="outline" size="sm" onClick={() => setGenOpen(true)} disabled={generating}>
                <RefreshCw /> Regenerate
              </Button>
            )}
            <Button size="sm" onClick={() => setExportOpen(true)} disabled={generating || report.status === "failed"}>
              <Download /> Export
            </Button>
          </div>
        }
      />

      {!rate && (
        <p className="mb-4 text-xs text-muted-foreground" data-print-hide>
          No KHR conversion rate is configured, so riel amounts are excluded from USD totals and KHR/dual views are unavailable.{" "}
          <Link href="/settings" className="font-medium text-primary hover:underline">Configure a rate</Link>
        </p>
      )}

      {generating ? (
        <Card className="items-center gap-2 p-10 text-center" role="status">
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium">Generating the {formatMonth(report.month)} report…</p>
          <p className="text-sm text-muted-foreground">Checking reconciliations and categorization, then calculating the figures.</p>
        </Card>
      ) : report.status === "failed" ? (
        <Card className="py-0">
          <ErrorState title="Report generation failed" description={report.missing[0] ?? "The report could not be generated."} onRetry={canGenerate ? () => setGenOpen(true) : undefined} />
        </Card>
      ) : (
        <div className="space-y-6">
          <CompletenessBanner status={report.status} issues={issues} canGenerate={canGenerate} onRegenerate={() => setGenOpen(true)} generatedAt={report.generatedAt} />

          {loading ? (
            <>
              <CardsSkeleton />
              <Card className="p-5"><ChartSkeleton /></Card>
            </>
          ) : (
            <>
              <section aria-labelledby="sum-h" className={sectionCls("summary")}>
                <h2 id="sum-h" className="sr-only">Summary</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    { label: "Revenue", get: (f: ReportFigures) => f.totals.revenue, prev: (f: ReportFigures) => f.prev.revenue.value, invert: false },
                    { label: "Expenses", get: (f: ReportFigures) => f.totals.expenses, prev: (f: ReportFigures) => f.prev.expenses.value, invert: true },
                  ] as const).map((k) => (
                    <StatCard
                      key={k.label}
                      label={k.label}
                      value={sumCell(k.get, curs[0])}
                      delta={percentChange(k.get(primary).value, k.prev(primary))}
                      invertDelta={k.invert}
                      deltaLabel={`vs ${formatMonth(previousMonth(report.month))}`}
                      description={curs[1] ? sumCell(k.get, curs[1], "text-xs") : undefined}
                    />
                  ))}
                  <StatCard
                    label="Net profit"
                    value={<Money amount={primary.totals.net} currency={curs[0]} className={cn(primary.totals.net < 0 && "text-error-text")} />}
                    delta={percentChange(primary.totals.net, primary.prev.net)}
                    deltaLabel={`vs ${formatMonth(previousMonth(report.month))}`}
                    description={curs[1] ? <Money amount={figs[curs[1]]!.totals.net} currency={curs[1]} /> : `Previous: ${formatMoney(primary.prev.net, curs[0])}`}
                  />
                  <StatCard
                    label="Profit margin"
                    value={primary.totals.margin !== null ? formatPercent(primary.totals.margin) : "—"}
                    description={
                      primary.totals.margin !== null && primary.prev.margin !== null
                        ? `${primary.totals.margin - primary.prev.margin >= 0 ? "+" : "−"}${Math.abs(primary.totals.margin - primary.prev.margin).toFixed(1)} pts vs ${formatPercent(primary.prev.margin)} in ${formatMonth(previousMonth(report.month))}`
                        : undefined
                    }
                  />
                </div>
                <Note className="mt-2" />
              </section>

              <div className="grid gap-6 xl:grid-cols-5">
                <Card className={cn("gap-0 py-0 xl:col-span-3 print-avoid", sectionCls("trend"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle>Revenue vs expenses</CardTitle>
                    <CardDescription>Last {primary.series.points.length} months in {curs[0]}{curs[1] ? " (chart uses USD)" : ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 py-4">
                    <ChartLegend items={[{ label: "Revenue", color: SERIES.income }, { label: "Expenses", color: SERIES.expenses }]} />
                    <div className="h-64" role="img" aria-label={`Monthly revenue and expenses: ${primary.series.points.map((p) => `${p.label} revenue ${formatMoney(p.income, curs[0])}, expenses ${formatMoney(p.expenses, curs[0])}`).join("; ")}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={primary.series.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                          <CartesianGrid {...GRID_PROPS} />
                          <XAxis dataKey="label" {...AXIS_PROPS} />
                          <YAxis {...AXIS_PROPS} width={60} tickFormatter={moneyTick(curs[0])} />
                          <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip currency={curs[0]} />} />
                          <Bar dataKey="income" name="Revenue" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="expenses" name="Expenses" fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className={cn("gap-0 py-0 xl:col-span-2 print-avoid", sectionCls("insights"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle className="flex items-center gap-2">
                      AI insights <AIBadge label="Generated from figures" />
                    </CardTitle>
                    <CardDescription>Rule-based observations from this report's numbers.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 py-4">
                    <ul className="space-y-2.5">
                      {insights.map((i) => {
                        const Icon = i.tone === "positive" ? TrendingUp : i.tone === "negative" ? TrendingDown : Minus;
                        return (
                          <li key={i.id} className="flex gap-2.5 text-sm">
                            <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded", i.tone === "positive" && "bg-success-light text-success-text", i.tone === "negative" && "bg-warning-light text-warning-text", i.tone === "neutral" && "bg-muted text-muted-foreground")}>
                              <Icon className="size-3" aria-hidden />
                              <span className="sr-only">{i.tone === "positive" ? "Positive:" : i.tone === "negative" ? "Watch:" : "Note:"}</span>
                            </span>
                            <span>{i.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-xs text-muted-foreground">{t("ai.disclaimer")}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className={cn("gap-0 py-0 print-avoid", sectionCls("categories"))}>
                <CardHeader className="border-b py-4">
                  <CardTitle>Expenses by category</CardTitle>
                  <CardDescription>Compared with {formatMonth(previousMonth(report.month))}</CardDescription>
                </CardHeader>
                <div className="grid lg:grid-cols-2">
                  <div className="border-b p-4 lg:border-r lg:border-b-0">
                    <CategoryBars figures={primary} currency={curs[0]} />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Category</TableHead>
                          {curs.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                          <TableHead className="text-right">Share</TableHead>
                          <TableHead className="text-right">vs prev.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {primary.categories.map((cat) => {
                          const d = percentChange(cat.value, cat.prev);
                          return (
                            <TableRow key={cat.categoryId}>
                              <TableCell className="font-medium">{cat.name}</TableCell>
                              {curs.map((c) => <TableCell key={c} className="text-right"><Money amount={figs[c]!.categories.find((x) => x.categoryId === cat.categoryId)?.value ?? 0} currency={c} /></TableCell>)}
                              <TableCell className="text-right tabular-nums text-muted-foreground">{formatPercent(cat.share, 0)}</TableCell>
                              <TableCell className={cn("text-right tabular-nums", d !== null && d > 5 && "text-warning-text")}>{d === null ? "new" : formatPercent(d, 0, true)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell>Total</TableCell>
                          {curs.map((c) => <TableCell key={c} className="text-right">{sumCell((f) => f.totals.expenses, c)}</TableCell>)}
                          <TableCell className="text-right">100%</TableCell>
                          <TableCell className="text-right tabular-nums">{(() => { const d = percentChange(primary.totals.expenses.value, primary.prev.expenses.value); return d === null ? "—" : formatPercent(d, 0, true); })()}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                <Note className="border-t px-4 py-3" />
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className={cn("gap-0 py-0 print-avoid", sectionCls("items"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle>Top-selling items</CardTitle>
                    <CardDescription>Itemized sales (walk-in, POS, online)</CardDescription>
                  </CardHeader>
                  {primary.topItems.length === 0 ? (
                    <EmptyState compact title="No item sales this month" />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Units</TableHead>
                            {curs.map((c) => <TableHead key={c} className="text-right">Revenue ({c})</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {primary.topItems.map((it) => (
                            <TableRow key={it.itemId}>
                              <TableCell>
                                <Link href={`/items/${it.itemId}`} className="font-medium hover:text-primary hover:underline">{it.name}</Link>
                                <span className="block text-xs text-muted-foreground">{it.sku}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{it.quantity.toLocaleString("en-US")}</TableCell>
                              {curs.map((c) => <TableCell key={c} className="text-right"><Money amount={figs[c]!.topItems.find((x) => x.itemId === it.itemId)?.revenue ?? 0} currency={c} /></TableCell>)}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>

                <Card className={cn("gap-0 py-0 print-avoid", sectionCls("branches"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle>Top branches</CardTitle>
                    <CardDescription>Ranked by revenue</CardDescription>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branch</TableHead>
                          {curs.map((c) => <TableHead key={c} className="text-right">Revenue ({c})</TableHead>)}
                          <TableHead className="text-right">Net ({curs[0]})</TableHead>
                          <TableHead className="text-right">Margin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {primary.branches.map((b, i) => (
                          <TableRow key={b.branchId}>
                            <TableCell className="font-medium">
                              <span className="mr-2 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                              {b.name}
                            </TableCell>
                            {curs.map((c) => <TableCell key={c} className="text-right"><Money amount={figs[c]!.branches.find((x) => x.branchId === b.branchId)?.revenue ?? 0} currency={c} /></TableCell>)}
                            <TableCell className="text-right"><Money amount={b.net} currency={curs[0]} className={cn(b.net < 0 && "text-error-text")} /></TableCell>
                            <TableCell className="text-right tabular-nums">{b.margin !== null ? formatPercent(b.margin) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className={cn("gap-0 py-0 print-avoid", sectionCls("cash"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle>Cash position</CardTitle>
                    <CardDescription>Account balances at the end of {formatDate(primary.end)}</CardDescription>
                  </CardHeader>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Type</TableHead>
                          {curs.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {primary.cash.byAccount.map(({ account, balance }) => (
                          <TableRow key={account.id}>
                            <TableCell>
                              <Link href={`/accounts/${account.id}`} className="font-medium hover:text-primary hover:underline">{account.name}</Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{ACCOUNT_TYPE[account.type]}</TableCell>
                            {curs.map((c) => {
                              if (c === account.currency) return <TableCell key={c} className="text-right"><Money amount={balance} currency={c} /></TableCell>;
                              const v = convert(balance, account.currency, c, rate);
                              return (
                                <TableCell key={c} className="text-right text-muted-foreground">
                                  {v === null ? "—" : <span className="tabular-nums" title={`Converted from ${formatMoney(balance, account.currency)} at ${rateLabel(rate)}`}>≈{formatMoney(v, c)}<span className="sr-only"> (converted)</span></span>}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={2}>Total cash</TableCell>
                          {curs.map((c) => <TableCell key={c} className="text-right">{sumCell((f) => f.cash.total, c)}</TableCell>)}
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                  <p className="border-t px-4 py-3 text-xs text-muted-foreground">Values marked ≈ are converted from the account's own currency at {rateLabel(rate)}.</p>
                </Card>

                <Card className={cn("gap-0 py-0 print-avoid", sectionCls("outstanding"))}>
                  <CardHeader className="border-b py-4">
                    <CardTitle>Outstanding invoices & bills</CardTitle>
                    <CardDescription>Open balances as of {formatDate(today())} (live)</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
                    {[
                      { label: "Receivables", sub: `${primary.receivables.count} open invoices`, overdueN: primary.receivables.overdueCount, total: (f: ReportFigures) => f.receivables.total, overdue: (f: ReportFigures) => f.receivables.overdue, href: "/invoices?status=overdue", cta: "View invoices" },
                      { label: "Payables", sub: `${primary.payables.count} unpaid bills`, overdueN: primary.payables.overdueCount, total: (f: ReportFigures) => f.payables.total, overdue: (f: ReportFigures) => f.payables.overdue, href: "/bills", cta: "View bills" },
                    ].map((x) => (
                      <div key={x.label} className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">{x.label}</p>
                        <p className="mt-1 text-xl font-semibold tracking-tight">{sumCell(x.total, curs[0])}</p>
                        {curs[1] && <p className="text-xs text-muted-foreground">{sumCell(x.total, curs[1])}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{x.sub}</p>
                        {x.overdueN > 0 ? (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-error-text">
                            <AlertTriangle className="size-3" aria-hidden /> {x.overdueN} overdue · {sumCell(x.overdue, curs[0])}
                          </p>
                        ) : (
                          <p className="mt-2 inline-flex items-center gap-1 text-xs text-success-text"><CheckCircle2 className="size-3" aria-hidden /> None overdue</p>
                        )}
                        <Link href={x.href} className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-print-hide>
                          {x.cta} <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className={cn("gap-0 py-0 print-avoid", sectionCls("insights"))}>
                <CardHeader className="border-b py-4">
                  <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-muted-foreground" aria-hidden /> Recommended actions</CardTitle>
                  <CardDescription>Suggestions derived from this report — you decide and act on each page.</CardDescription>
                </CardHeader>
                {actions.length === 0 ? (
                  <EmptyState compact icon={CheckCircle2} title="Nothing needs attention" description="No open issues were found for this month." />
                ) : (
                  <ul className="divide-y">
                    {actions.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.title}</p>
                          <p className="text-sm text-muted-foreground">{a.detail}</p>
                        </div>
                        <Button variant="outline" size="sm" asChild data-print-hide>
                          <Link href={a.href}>{a.cta} <ArrowRight /></Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <DemoNotice variant="ai">Insights and recommendations are generated by deterministic rules from the figures above (simulated AI). {t("ai.disclaimer")}</DemoNotice>
            </>
          )}
        </div>
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} report={report} rate={rate} initialView={view} onCsv={doCsv} onPrint={doPrint} />
      {canGenerate && <GenerateReportDialog open={genOpen} onOpenChange={setGenOpen} months={[report.month]} initialMonth={report.month} />}
    </>
  );
}

function CompletenessBanner({ status, issues, canGenerate, onRegenerate, generatedAt }: { status: string; issues: ReturnType<typeof reportReadiness>; canGenerate: boolean; onRegenerate: () => void; generatedAt?: string }) {
  if (status === "complete") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/25 bg-success-light px-4 py-3 text-sm text-success-text">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Complete report</p>
          <p className="opacity-90">All accounts were reconciled and every transaction categorized when this report was generated{generatedAt ? ` on ${formatDateTime(generatedAt)}` : ""}.</p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Incomplete report — figures may change</p>
          {issues.length ? (
            <>
              <p className="opacity-90">Resolve these items, then regenerate the report to mark it complete:</p>
              <ul className="mt-2 space-y-2">
                {issues.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/60 px-3 py-2 text-foreground">
                    <span className="min-w-0">
                      <span className="block">{i.label}</span>
                      <span className="block text-xs text-muted-foreground">{i.detail}</span>
                    </span>
                    <Button size="xs" variant="outline" asChild data-print-hide>
                      <Link href={i.href}>{i.actionLabel} <ArrowRight /></Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <p className="opacity-90">All items that made this report incomplete have since been resolved.</p>
              {canGenerate && (
                <Button size="sm" variant="outline" onClick={onRegenerate} data-print-hide>
                  <RefreshCw /> Regenerate to mark complete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryBars({ figures, currency }: { figures: ReportFigures; currency: Currency }) {
  const data = figures.categories.filter((c) => c.value > 0).slice(0, 8).map((c) => ({ label: c.name, value: c.value }));
  if (!data.length) return <EmptyState compact title="No expenses this month" />;
  return (
    <div style={{ height: data.length * 34 + 30 }} role="img" aria-label={`Expenses by category: ${data.map((d) => `${d.label} ${formatMoney(d.value, currency)}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} tickFormatter={moneyTick(currency)} />
          <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={150} />
          <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip currency={currency} />} />
          <Bar dataKey="value" name="Expenses" fill={SERIES.expenses} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


