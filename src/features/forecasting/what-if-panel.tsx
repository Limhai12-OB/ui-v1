"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, FolderOpen, Loader2, RotateCcw, Target, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import type { Currency, TargetBudget, WhatIfScenario } from "@/types";
import { useAppStore, uid } from "@/store/app-store";
import { useAction } from "@/hooks/use-action";
import { aiService } from "@/lib/api";
import { convert, formatMoney, rateLabel } from "@/lib/currency";
import { formatDateTime, nowISO } from "@/lib/date";
import { AXIS_PROPS, ChartLegend, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { applyScenario, type BaselineForecast, type ScenarioParams, type ScenarioResult } from "./model";

const DEFAULT_PARAMS: ScenarioParams = {
  newBranch: { enabled: false, monthlyRevenue: 18000, monthlyCost: 14500, setupCost: 12000, openingInDays: 30 },
  supplierIncrease: { enabled: false, percent: 9 },
  salesDecrease: { enabled: false, percent: 10 },
};

const SCENARIO_COLOR = SERIES.c4;
const BASELINE_COLOR = "var(--muted-foreground)";

interface Props {
  base: BaselineForecast;
  display: Currency;
  rate: number | null;
  /** Currency the what-if inputs are entered in (business default). */
  inputCurrency: Currency;
}

export function WhatIfPanel({ base, display, rate, inputCurrency }: Props) {
  const scenarios = useAppStore((s) => s.scenarios);
  const budgets = useAppStore((s) => s.targetBudgets);
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [loaded, setLoaded] = useState<WhatIfScenario | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [deletingScenario, setDeletingScenario] = useState<WhatIfScenario | undefined>();
  const [deletingBudget, setDeletingBudget] = useState<TargetBudget | undefined>();
  const removeScenario = useAction((id: string) => aiService.deleteScenario(id), { success: "Scenario deleted" });
  const removeBudget = useAction((id: string) => aiService.deleteTargetBudget(id), { success: "Target budget deleted" });

  const convertible = inputCurrency === display || !!rate;

  const displayParams: ScenarioParams | null = useMemo(() => {
    if (!convertible) return null;
    const c = (v: number) => (inputCurrency === display ? v : (convert(v, inputCurrency, display, rate) ?? 0));
    return {
      ...params,
      newBranch: { ...params.newBranch, monthlyRevenue: c(params.newBranch.monthlyRevenue), monthlyCost: c(params.newBranch.monthlyCost), setupCost: c(params.newBranch.setupCost) },
    };
  }, [params, convertible, inputCurrency, display, rate]);

  const baseline = useMemo(() => applyScenario(base, null), [base]);
  const scenario = useMemo(() => applyScenario(base, displayParams), [base, displayParams]);
  const anyEnabled = params.newBranch.enabled || params.supplierIncrease.enabled || params.salesDecrease.enabled;

  const chartData = useMemo(
    () =>
      baseline.cash
        .map((b, i) => ({ date: b.date, label: format(parseISO(b.date), "d MMM"), baseline: b.p50, scenario: scenario.cash[i]?.p50 }))
        .filter((_, i, arr) => i % 3 === 0 || i === arr.length - 1),
    [baseline, scenario],
  );

  const set = <K extends keyof ScenarioParams>(k: K, patch: Partial<ScenarioParams[K]>) => setParams((p) => ({ ...p, [k]: { ...p[k], ...patch } }));
  const num = (v: number | "") => (v === "" ? 0 : v);

  const fm = (v: number) => formatMoney(v, display);
  const runway = (r: ScenarioResult) => (r.runwayMonths === null ? "Not burning cash" : `${r.runwayMonths.toFixed(1)} months`);
  const rows: { label: string; b: number; s: number; invert?: boolean; text?: (r: ScenarioResult) => string }[] = [
    { label: "Revenue", b: baseline.revenue.p50, s: scenario.revenue.p50 },
    { label: "Expenses", b: baseline.expenses.p50, s: scenario.expenses.p50, invert: true },
    { label: "Net cash flow", b: baseline.net.p50, s: scenario.net.p50 },
    { label: "Ending cash", b: baseline.endingCash.p50, s: scenario.endingCash.p50 },
  ];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>What-if simulation</CardTitle>
        <CardDescription>
          Adjust assumptions to see their effect over the next {base.horizonDays} days. Results recalculate instantly from the baseline forecast.
          {loaded && <> Editing saved scenario <span className="font-medium text-foreground">“{loaded.name}”</span>.</>}
        </CardDescription>
      </CardHeader>

      {!convertible ? (
        <CardContent className="py-6 text-sm text-muted-foreground">What-if amounts are entered in {inputCurrency}. Configure a conversion rate in Settings to simulate in {display}.</CardContent>
      ) : (
        <div className="grid xl:grid-cols-[minmax(320px,380px)_1fr]">
          {/* Controls */}
          <div className="space-y-4 border-b p-5 xl:border-r xl:border-b-0">
            <Toggle id="wi-branch" label="New branch opening" checked={params.newBranch.enabled} onChange={(v) => set("newBranch", { enabled: v })}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly revenue" htmlFor="wi-nb-rev">
                  <MoneyInput id="wi-nb-rev" currency={inputCurrency} value={params.newBranch.monthlyRevenue} onValueChange={(v) => set("newBranch", { monthlyRevenue: num(v) })} />
                </Field>
                <Field label="Monthly costs" htmlFor="wi-nb-cost">
                  <MoneyInput id="wi-nb-cost" currency={inputCurrency} value={params.newBranch.monthlyCost} onValueChange={(v) => set("newBranch", { monthlyCost: num(v) })} />
                </Field>
                <Field label="Setup cost (one-time)" htmlFor="wi-nb-setup">
                  <MoneyInput id="wi-nb-setup" currency={inputCurrency} value={params.newBranch.setupCost} onValueChange={(v) => set("newBranch", { setupCost: num(v) })} />
                </Field>
                <Field label="Opens in (days)" htmlFor="wi-nb-days" error={params.newBranch.openingInDays > base.horizonDays ? "After the forecast horizon" : undefined}>
                  <Input id="wi-nb-days" type="number" min={1} max={180} value={params.newBranch.openingInDays} onChange={(e) => set("newBranch", { openingInDays: Math.max(1, Math.min(180, Number(e.target.value) || 1)) })} className="tabular-nums" />
                </Field>
              </div>
            </Toggle>
            <Toggle id="wi-supplier" label="Supplier price increase" checked={params.supplierIncrease.enabled} onChange={(v) => set("supplierIncrease", { enabled: v })}>
              <PercentField id="wi-sup-pct" label="Price increase" value={params.supplierIncrease.percent} onChange={(v) => set("supplierIncrease", { percent: v })} max={100} />
              <p className="mt-1.5 text-xs text-muted-foreground">Applied to Inventory Purchases, which were {(base.inventoryShare * 100).toFixed(0)}% of expenses over the last 90 days.</p>
            </Toggle>
            <Toggle id="wi-sales" label="Sales decrease" checked={params.salesDecrease.enabled} onChange={(v) => set("salesDecrease", { enabled: v })}>
              <PercentField id="wi-sales-pct" label="Decrease" value={params.salesDecrease.percent} onChange={(v) => set("salesDecrease", { percent: v })} max={100} />
              <p className="mt-1.5 text-xs text-muted-foreground">Reduces forecast revenue; costs are held at the baseline.</p>
            </Toggle>
            {inputCurrency !== display && <p className="text-xs text-muted-foreground">Inputs in {inputCurrency}; results in {display} at {rateLabel(rate)}.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setSaveOpen(true)} disabled={!anyEnabled}>
                <BookmarkPlus /> Save scenario
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBudgetOpen(true)}>
                <Target /> Save as Target Budget
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setParams(DEFAULT_PARAMS);
                  setLoaded(null);
                }}
              >
                <RotateCcw /> Reset
              </Button>
            </div>
          </div>

          {/* Results */}
          <div className="min-w-0 space-y-4 p-5" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Cash balance — baseline vs scenario</h3>
              <ChartLegend items={[{ label: "Baseline", color: BASELINE_COLOR, dashed: true }, { label: anyEnabled ? "Scenario" : "Scenario (no changes)", color: SCENARIO_COLOR }]} />
            </div>
            <div className="h-56" role="img" aria-label={`Ending cash: baseline ${fm(baseline.endingCash.p50)}, scenario ${fm(scenario.endingCash.p50)}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={24} interval="preserveStartEnd" />
                  <YAxis {...AXIS_PROPS} width={60} tickFormatter={moneyTick(display)} domain={["auto", "auto"]} />
                  <Tooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltip currency={display} />} />
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke={BASELINE_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="scenario" name="Scenario" stroke={SCENARIO_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Next {base.horizonDays} days (P50)</TableHead>
                    <TableHead className="text-right">Baseline</TableHead>
                    <TableHead className="text-right">Scenario</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const d = r.s - r.b;
                    const good = r.invert ? d < 0 : d > 0;
                    return (
                      <TableRow key={r.label}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{fm(r.b)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fm(r.s)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", Math.abs(d) >= 0.5 && (good ? "text-success-text" : "text-error-text"))}>{Math.abs(d) < 0.5 ? "—" : formatMoney(d, display, { signed: true })}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell className="font-medium">Cash runway</TableCell>
                    <TableCell className="text-right tabular-nums">{runway(baseline)}</TableCell>
                    <TableCell className="text-right tabular-nums">{runway(scenario)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {baseline.runwayMonths === null && scenario.runwayMonths === null ? "—" : scenario.runwayMonths === null ? "Improves" : baseline.runwayMonths === null ? "Starts burning" : `${(scenario.runwayMonths - baseline.runwayMonths).toFixed(1)} mo`}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Scenario values are simulated from the baseline forecast; they are estimates, not commitments.</p>
          </div>
        </div>
      )}

      {/* Saved scenarios & budgets */}
      <div className="grid border-t lg:grid-cols-2">
        <div className="border-b p-5 lg:border-r lg:border-b-0">
          <h3 className="mb-3 text-sm font-medium">Saved scenarios</h3>
          {scenarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved scenarios. Turn on an assumption and choose “Save scenario”.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {scenarios.map((s) => (
                <li key={s.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2", loaded?.id === s.id && "bg-primary-light/40")}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.newBranch.enabled && "New branch", s.supplierIncrease.enabled && `Supplier +${s.supplierIncrease.percent}%`, s.salesDecrease.enabled && `Sales −${s.salesDecrease.percent}%`].filter(Boolean).join(" · ") || "No changes"} · {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setParams({ newBranch: s.newBranch, supplierIncrease: s.supplierIncrease, salesDecrease: s.salesDecrease });
                        setLoaded(s);
                      }}
                    >
                      <FolderOpen /> Load
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`Delete scenario ${s.name}`} onClick={() => setDeletingScenario(s)}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-5">
          <h3 className="mb-3 text-sm font-medium">Target budgets</h3>
          {budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No target budgets yet. Use “Save as Target Budget” to turn a forecast into targets.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {budgets.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {b.name} <Badge variant="outline">{b.periodDays} days</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Revenue ≥ {formatMoney(b.revenueTarget, b.currency)} · Expenses ≤ {formatMoney(b.expenseLimit, b.currency)} · Net {formatMoney(b.netTarget, b.currency)}
                    </p>
                  </div>
                  <Button size="icon-xs" variant="ghost" aria-label={`Delete target budget ${b.name}`} onClick={() => setDeletingBudget(b)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SaveScenarioDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        existing={loaded}
        onSave={async (name, asNew) => {
          const s: WhatIfScenario = { id: !asNew && loaded ? loaded.id : uid("scn"), name, createdAt: !asNew && loaded ? loaded.createdAt : nowISO(), horizonDays: base.horizonDays, ...params };
          await aiService.saveScenario(s);
          setLoaded(s);
        }}
      />
      <TargetBudgetDialog
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        horizonDays={base.horizonDays}
        result={scenario}
        currency={display}
        onSave={async (name, periodDays) => {
          let scenarioId = loaded?.id;
          if (!scenarioId) {
            const s: WhatIfScenario = { id: uid("scn"), name: `${name} — scenario`, createdAt: nowISO(), horizonDays: base.horizonDays, ...params };
            await aiService.saveScenario(s);
            setLoaded(s);
            scenarioId = s.id;
          }
          const days = scenario.days.slice(0, periodDays);
          const rev = days.reduce((a, d) => a + d.revenue, 0);
          const exp = days.reduce((a, d) => a + d.expenses, 0);
          const round = (v: number) => (display === "USD" ? Math.round(v * 100) / 100 : Math.round(v));
          await aiService.saveTargetBudget({ id: uid("tb"), name, scenarioId, createdAt: nowISO(), periodDays, revenueTarget: round(rev), expenseLimit: round(exp), netTarget: round(rev - exp), currency: display });
        }}
      />
      <ConfirmDialog open={!!deletingScenario} onOpenChange={(o) => !o && setDeletingScenario(undefined)} title={`Delete “${deletingScenario?.name}”?`} description="The saved scenario will be removed. Target budgets created from it are kept." confirmLabel="Delete scenario" destructive onConfirm={async () => { const id = deletingScenario!.id; await removeScenario.run(id); if (loaded?.id === id) setLoaded(null); }} />
      <ConfirmDialog open={!!deletingBudget} onOpenChange={(o) => !o && setDeletingBudget(undefined)} title={`Delete “${deletingBudget?.name}”?`} description="This target budget will be removed." confirmLabel="Delete budget" destructive onConfirm={() => removeBudget.run(deletingBudget!.id)} />
    </Card>
  );
}

function Toggle({ id, label, checked, onChange, children }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-3 transition-colors", checked && "border-primary/40 bg-primary-light/30")}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && <div className="mt-3">{children}</div>}
    </div>
  );
}

function PercentField({ id, label, value, onChange, max }: { id: string; label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <Field label={`${label} (%)`} htmlFor={id}>
      <div className="relative">
        <Input id={id} type="number" min={0} max={max} step={0.5} value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} className="pr-8 tabular-nums" />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground" aria-hidden>%</span>
      </div>
    </Field>
  );
}

function SaveScenarioDialog({ open, onOpenChange, existing, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; existing: WhatIfScenario | null; onSave: (name: string, asNew: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(existing?.name ?? "");
  }, [open, existing]);
  const save = useAction(onSave, { success: "Scenario saved", onSuccess: () => onOpenChange(false) });
  const trimmed = name.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => !save.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); if (trimmed) save.fire(trimmed, !existing); }}>
          <DialogHeader>
            <DialogTitle>{existing ? "Save scenario" : "Save new scenario"}</DialogTitle>
            <DialogDescription>Saved scenarios keep these assumptions so you can reload and compare them later.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Field label="Scenario name" htmlFor="scn-name" required>
              <Input id="scn-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Open Tuol Tompoung in November" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>Cancel</Button>
            {existing && (
              <Button type="button" variant="outline" disabled={!trimmed || save.pending} onClick={() => save.fire(trimmed, true)}>
                Save as new
              </Button>
            )}
            <Button type="submit" disabled={!trimmed || save.pending}>
              {save.pending && <Loader2 className="animate-spin" />}
              {existing ? "Update scenario" : "Save scenario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TargetBudgetDialog({ open, onOpenChange, horizonDays, result, currency, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; horizonDays: number; result: ScenarioResult; currency: Currency; onSave: (name: string, periodDays: number) => Promise<void> }) {
  const [name, setName] = useState("");
  const options = useMemo(() => [...new Set([30, 60, 90, horizonDays].filter((d) => d <= horizonDays))].sort((a, b) => a - b), [horizonDays]);
  const [period, setPeriod] = useState(String(horizonDays));
  useEffect(() => {
    if (open) {
      setName("");
      setPeriod(String(horizonDays));
    }
  }, [open, horizonDays]);
  const save = useAction(onSave, { success: "Target budget saved", onSuccess: () => onOpenChange(false) });
  const days = result.days.slice(0, Number(period));
  const rev = days.reduce((a, d) => a + d.revenue, 0);
  const exp = days.reduce((a, d) => a + d.expenses, 0);
  const trimmed = name.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => !save.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); if (trimmed) save.fire(trimmed, Number(period)); }}>
          <DialogHeader>
            <DialogTitle>Save as Target Budget</DialogTitle>
            <DialogDescription>Turns the current scenario’s expected (P50) figures into targets for the chosen period.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field label="Budget name" htmlFor="tb-name" required>
              <Input id="tb-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 operating budget" />
            </Field>
            <Field label="Period" htmlFor="tb-period" required>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="tb-period" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.map((d) => <SelectItem key={d} value={String(d)}>Next {d} days</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <dl className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Revenue target</dt><dd className="font-medium tabular-nums">{formatMoney(rev, currency)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Expense limit</dt><dd className="font-medium tabular-nums">{formatMoney(exp, currency)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Net target</dt><dd className="font-medium tabular-nums">{formatMoney(rev - exp, currency)}</dd></div>
            </dl>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.pending}>Cancel</Button>
            <Button type="submit" disabled={!trimmed || save.pending}>
              {save.pending && <Loader2 className="animate-spin" />}
              Save target budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
