"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Gauge, Hourglass, ShieldAlert, ShieldCheck, ShieldQuestion, TrendingUp, Wallet } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useUIStore } from "@/store/ui-store";
import { useScope } from "@/hooks/use-scope";
import { useT } from "@/hooks/use-t";
import { aiService } from "@/lib/api";
import { salesHistoryDays } from "@/lib/analytics";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { formatMoney, formatPercent } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { AIBadge, DemoNotice } from "@/components/shared/demo-notice";
import { CardsSkeleton, ChartSkeleton, EmptyState, ErrorState } from "@/components/shared/states";
import { ConversionNote } from "@/components/shared/money";
import { SERIES } from "@/components/charts/chart-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { applyScenario, cashRows, MAX_HORIZON_DAYS, MIN_HISTORY_DAYS, weeklyRows, type BaselineForecast, type Range } from "./model";
import { ForecastChart } from "./forecast-chart";
import { WhatIfPanel } from "./what-if-panel";

type Mode = "30" | "60" | "90" | "custom";

export function ForecastingPage() {
  const t = useT();
  const transactions = useAppStore((s) => s.transactions);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const inputCurrency = useAppStore((s) => s.business.defaultCurrency);
  const setBranch = useUIStore((s) => s.setBranch);
  const { scope, money, branch, isOwner } = useScope();
  const asOf = today();
  const [mode, setMode] = useState<Mode>("30");
  const [customDays, setCustomDays] = useState<string>("45");
  const [debouncedCustom, setDebouncedCustom] = useState(45);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; data?: BaselineForecast; error?: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const customNum = Number(customDays);
  const customValid = Number.isInteger(customNum) && customNum >= 1 && customNum <= MAX_HORIZON_DAYS;
  useEffect(() => {
    if (!customValid) return;
    const h = setTimeout(() => setDebouncedCustom(customNum), 400);
    return () => clearTimeout(h);
  }, [customNum, customValid]);
  const horizon = mode === "custom" ? debouncedCustom : Number(mode);

  const historyDays = useMemo(() => salesHistoryDays(transactions, scope), [transactions, scope]);
  const enoughHistory = historyDays >= MIN_HISTORY_DAYS;
  const scopeLabel = branch ? branch.name : "All branches";

  useEffect(() => {
    if (!enoughHistory) return;
    let cancelled = false;
    setState((s) => ({ status: "loading", data: s.data }));
    aiService
      .forecast({ transactions, accounts, categories, scope, money, asOf, horizonDays: horizon })
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((e: unknown) => !cancelled && setState({ status: "error", error: e instanceof Error ? e.message : "Forecast failed" }));
    return () => {
      cancelled = true;
    };
  }, [transactions, accounts, categories, scope, money, asOf, horizon, enoughHistory, attempt]);

  const base = state.status === "ready" ? state.data : undefined;
  const result = useMemo(() => (base ? applyScenario(base, null) : undefined), [base]);
  const cur = money.display;

  return (
    <>
      <PageHeader
        title={t("nav.forecasting")}
        meta={<AIBadge label="Simulated model" />}
        description="Expected revenue, expenses and cash for the coming weeks, with a likely range, plus what-if scenarios you can turn into target budgets."
      />

      <Card className="mb-6 flex-row flex-wrap items-end gap-x-6 gap-y-4 p-4">
        <div className="space-y-1.5">
          <span id="horizon-label" className="text-[13px] font-medium">Horizon</span>
          <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-labelledby="horizon-label">
            <ToggleGroupItem value="30">30 days</ToggleGroupItem>
            <ToggleGroupItem value="60">60 days</ToggleGroupItem>
            <ToggleGroupItem value="90">90 days</ToggleGroupItem>
            <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {mode === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fc-days" className="text-[13px]">Days ahead</Label>
              <Input id="fc-days" type="number" min={1} max={MAX_HORIZON_DAYS} value={customDays} onChange={(e) => setCustomDays(e.target.value)} className="h-8 w-24 tabular-nums" aria-invalid={!customValid} aria-describedby="fc-days-help" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-date" className="text-[13px]">or until date</Label>
              <Input
                id="fc-date"
                type="date"
                min={addDaysISO(asOf, 1)}
                max={addDaysISO(asOf, MAX_HORIZON_DAYS)}
                value={customValid ? addDaysISO(asOf, customNum) : ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const d = Math.round((Date.parse(e.target.value) - Date.parse(asOf)) / 86_400_000);
                  setCustomDays(String(d));
                }}
                className="h-8 w-40"
              />
            </div>
            <p id="fc-days-help" className={cn("pb-1.5 text-xs", customValid ? "text-muted-foreground" : "text-destructive")} role={customValid ? undefined : "alert"}>
              {customValid ? `Through ${formatDate(addDaysISO(asOf, customNum))}` : `Enter 1–${MAX_HORIZON_DAYS} days`}
            </p>
          </div>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          Scope: <span className="font-medium text-foreground">{scopeLabel}</span> · {cur} · history through {formatDate(asOf)}
          {isOwner && <span className="block sm:inline"> · change scope with the branch selector</span>}
        </div>
      </Card>

      {!enoughHistory ? (
        <InsufficientHistory days={historyDays} scopeLabel={scopeLabel} asOf={asOf} onAllBranches={isOwner && branch ? () => setBranch("all") : undefined} />
      ) : state.status === "error" ? (
        <Card className="py-0"><ErrorState title="Forecast unavailable" description={state.error} onRetry={() => setAttempt((a) => a + 1)} /></Card>
      ) : !base || !result || state.status === "loading" ? (
        <div className="space-y-6" aria-busy="true" role="status" aria-label="Calculating forecast">
          <p className="text-sm text-muted-foreground">Fitting the forecast model to the last 90 days for {scopeLabel}…</p>
          <CardsSkeleton count={5} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5"><ChartSkeleton /></Card>
            <Card className="p-5"><ChartSkeleton /></Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <RangeCard label={`Expected revenue · ${base.horizonDays}d`} range={result.revenue} currency={cur} icon={TrendingUp} />
            <RangeCard label={`Expected expenses · ${base.horizonDays}d`} range={result.expenses} currency={cur} icon={Wallet} />
            <RangeCard label={`Expected net cash flow · ${base.horizonDays}d`} range={result.net} currency={cur} icon={Gauge} signed />
            <RunwayCard months={result.runwayMonths} burn={result.monthlyBurn} cash={base.startCash} currency={cur} />
            <ReliabilityCard r={base.reliability} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Revenue forecast</CardTitle>
                <CardDescription>Average daily revenue per week · last 12 weeks and next {base.horizonDays} days</CardDescription>
              </CardHeader>
              <CardContent className="py-4">
                <ForecastChart rows={weeklyRows(base, result, "revenue")} color={SERIES.income} currency={cur} perDay label="Revenue forecast" />
              </CardContent>
            </Card>
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Expenses forecast</CardTitle>
                <CardDescription>Average daily expenses per week · rent and salaries are spread across weekdays</CardDescription>
              </CardHeader>
              <CardContent className="py-4">
                <ForecastChart rows={weeklyRows(base, result, "expenses")} color={SERIES.expenses} currency={cur} perDay label="Expenses forecast" />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Cash flow forecast</CardTitle>
              <CardDescription>Total cash across accounts in scope, starting from today’s balance of {formatMoney(base.startCash, cur)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 py-4">
              <ForecastChart rows={cashRows(base, result)} color={SERIES.c4} currency={cur} perDay={false} label="Cash balance forecast" height={260} />
              <ConversionNote converted={base.converted} excludedForeign={base.excludedForeign} rate={money.rate} currency={cur} />
            </CardContent>
          </Card>

          <WhatIfPanel base={base} display={cur} rate={money.rate} inputCurrency={inputCurrency} />

          <DemoNotice variant="ai">
            Simulated forecast: a deterministic weekday-seasonality × linear-trend model fitted to the last 90 days of posted transactions. P10–P90 is the range actual results would usually fall in if recent patterns continue — it is not a guarantee. {t("ai.disclaimer")}
          </DemoNotice>
        </div>
      )}
    </>
  );
}

function RangeCard({ label, range, currency, icon: Icon, signed }: { label: string; range: Range; currency: "USD" | "KHR"; icon: typeof TrendingUp; signed?: boolean }) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-light text-primary"><Icon className="size-4" aria-hidden /></span>
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", signed && range.p50 < 0 && "text-error-text")}>{formatMoney(range.p50, currency, { compact: true })}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        Range {formatMoney(range.p10, currency, { compact: true })} – {formatMoney(range.p90, currency, { compact: true })}
        <span className="sr-only"> (P10 conservative to P90 optimistic)</span>
      </p>
      <p className="text-[11px] text-muted-foreground">Expected (P50) · P10–P90</p>
    </Card>
  );
}

function RunwayCard({ months, burn, cash, currency }: { months: number | null; burn: number; cash: number; currency: "USD" | "KHR" }) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">Cash runway</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-light text-primary"><Hourglass className="size-4" aria-hidden /></span>
      </div>
      {months === null ? (
        <>
          <p className="text-2xl font-semibold tracking-tight">Not burning cash</p>
          <p className="text-xs text-muted-foreground">Expected net cash flow is positive, so cash is forecast to grow from {formatMoney(cash, currency, { compact: true })}.</p>
        </>
      ) : (
        <>
          <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", months < 3 && "text-error-text")}>{months.toFixed(1)} months</p>
          <p className="text-xs text-muted-foreground">At a forecast burn of {formatMoney(burn, currency, { compact: true })}/month from {formatMoney(cash, currency, { compact: true })}.</p>
        </>
      )}
    </Card>
  );
}

function ReliabilityCard({ r }: { r: BaselineForecast["reliability"] }) {
  const def = {
    high: { label: "High", icon: ShieldCheck, cls: "bg-success-light text-success-text" },
    medium: { label: "Medium", icon: ShieldQuestion, cls: "bg-warning-light text-warning-text" },
    low: { label: "Low", icon: ShieldAlert, cls: "bg-error-light text-error-text" },
  }[r.level];
  return (
    <Card className="gap-2 p-5">
      <p className="text-sm font-medium text-muted-foreground">Forecast reliability</p>
      <p className="flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold", def.cls)}>
          <def.icon className="size-4" aria-hidden /> {def.label}
        </span>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">
        Backtest {formatDate(r.windowStart, "d MMM")}–{formatDate(r.windowEnd, "d MMM")}: weekly revenue error {formatPercent(r.revenueMape)}, 30-day expenses error {formatPercent(r.expenseError)}.
      </p>
      <p className="text-[11px] text-muted-foreground">Historical backtested accuracy, not a guarantee of future results.</p>
    </Card>
  );
}

function InsufficientHistory({ days, scopeLabel, asOf, onAllBranches }: { days: number; scopeLabel: string; asOf: string; onAllBranches?: () => void }) {
  const remaining = MIN_HISTORY_DAYS - days;
  return (
    <Card className="py-0">
      <EmptyState
        icon={CalendarClock}
        title={`Not enough sales history to forecast ${scopeLabel}`}
        description={
          <>
            Forecasts need at least {MIN_HISTORY_DAYS} days of sales. {scopeLabel} has {days} day{days === 1 ? "" : "s"} so far, so a forecast would be guesswork — we don’t show one.
            {remaining > 0 && <> With daily sales recorded, it will be ready on about <span className="font-medium text-foreground">{formatDate(addDaysISO(asOf, remaining))}</span>.</>}
          </>
        }
        action={
          <div className="flex w-72 max-w-full flex-col items-center gap-3">
            <div className="w-full space-y-1">
              <Progress value={(days / MIN_HISTORY_DAYS) * 100} aria-label={`${days} of ${MIN_HISTORY_DAYS} days of history`} />
              <p className="text-xs text-muted-foreground tabular-nums">{days} / {MIN_HISTORY_DAYS} days</p>
            </div>
            {onAllBranches && (
              <Button variant="outline" size="sm" onClick={onAllBranches}>
                Forecast all branches instead
              </Button>
            )}
          </div>
        }
      />
    </Card>
  );
}
