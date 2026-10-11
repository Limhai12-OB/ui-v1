"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, FilePlus2, FileUp, Plus, SlidersHorizontal } from "lucide-react";
import type { DashboardSectionId } from "@/types";
import { useAppStore } from "@/store/app-store";
import { DEFAULT_DASHBOARD_LAYOUT, useUIStore } from "@/store/ui-store";
import { useScope } from "@/hooks/use-scope";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { businessHealth, currentPeriods, payables, periodTotals, receivables } from "@/lib/analytics";
import { formatDate } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { ConversionNote } from "@/components/shared/money";
import { KpiGrid } from "./kpi-grid";
import { HealthCard } from "./health-card";
import { AlertsCard } from "./alerts-card";
import { FinancialChartCard } from "./financial-chart-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { CustomizeSheet, SECTION_META } from "./customize-sheet";
import { SectionBoundary } from "./section-boundary";
import { useDashboardAlerts } from "./use-dashboard-alerts";

const LEGACY_DEFAULT_ORDER = "kpis,health,charts,alerts,transactions";

/** "1–11 Oct 2026" */
function rangeLabel(start: string, end: string, withYear = true) {
  return `${formatDate(start, "d")}–${formatDate(end, withYear ? "d MMM yyyy" : "d MMM")}`;
}

export function DashboardPage() {
  const loading = useInitialLoad();
  const { scope, money, user, branch, isOwner } = useScope();
  const business = useAppStore((s) => s.business);
  const transactions = useAppStore((s) => s.transactions);
  const accounts = useAppStore((s) => s.accounts);
  const invoices = useAppStore((s) => s.invoices);
  const bills = useAppStore((s) => s.bills);
  const layout = useUIStore((s) => s.dashboardLayout);
  const setLayout = useUIStore((s) => s.setDashboardLayout);
  // Layouts saved before health + alerts were paired by default adopt the new default order.
  useEffect(() => {
    if (!layout.hidden.length && layout.order.join() === LEGACY_DEFAULT_ORDER) setLayout(DEFAULT_DASHBOARD_LAYOUT);
  }, [layout, setLayout]);
  const [customizing, setCustomizing] = useState(false);
  const alerts = useDashboardAlerts();

  const periods = currentPeriods();
  const compareLabel = `vs ${rangeLabel(periods.prevStart, periods.prevEnd, false)}`;

  const figures = useMemo(() => {
    const p = currentPeriods();
    return {
      current: periodTotals(transactions, p.start, p.end, scope, money),
      previous: periodTotals(transactions, p.prevStart, p.prevEnd, scope, money),
      ar: receivables(invoices, scope, money),
      ap: payables(bills, scope, money),
      health: businessHealth({ transactions, accounts, invoices, bills }, scope, money),
    };
  }, [transactions, accounts, invoices, bills, scope, money]);

  const recent = useMemo(
    () =>
      transactions
        .filter((t) => scope.branchIds.includes(t.branchId))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [transactions, scope],
  );

  const firstName = user.name.split(" ")[0];
  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  const renderSection = (id: DashboardSectionId) => {
    const content = (() => {
      switch (id) {
        case "kpis":
          return (
            <section aria-labelledby="dash-kpis" className="space-y-2">
              <h2 id="dash-kpis" className="sr-only">
                Key figures
              </h2>
              <KpiGrid {...figures} money={money} compareLabel={compareLabel} loading={loading} />
              {!loading && <ConversionNote converted={figures.current.converted || figures.ar.total.converted || figures.ap.total.converted} excludedForeign={figures.current.excludedForeign || figures.ar.total.excludedForeign || figures.ap.total.excludedForeign} rate={money.rate} currency={money.display} />}
            </section>
          );
        case "health":
          return <HealthCard health={figures.health} loading={loading} />;
        case "alerts":
          return <AlertsCard alerts={alerts} loading={loading} />;
        case "charts":
          return <FinancialChartCard transactions={transactions} scope={scope} money={money} loading={loading} />;
        case "transactions":
          return <RecentTransactionsCard transactions={recent} loading={loading} />;
      }
    })();
    return (
      <SectionBoundary key={id} name={SECTION_META[id].label}>
        {content}
      </SectionBoundary>
    );
  };

  // Health and alerts sit side by side on wide screens when they are adjacent in the saved order.
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < visible.length; i++) {
    const id = visible[i];
    const next = visible[i + 1];
    const pair = (id === "health" && next === "alerts") || (id === "alerts" && next === "health");
    if (pair) {
      blocks.push(
        <div key={`${id}-${next}`} className="grid items-stretch gap-6 xl:grid-cols-2">
          {renderSection(id)}
          {renderSection(next)}
        </div>,
      );
      i++;
    } else blocks.push(renderSection(id));
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{business.name}</span>
            <span aria-hidden> · </span>
            {branch ? branch.name : isOwner ? "All branches" : "Your branch"}
            <span aria-hidden> · </span>
            Month to date · {rangeLabel(periods.start, periods.end)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button size="sm" asChild>
            <Link href="/transactions/new">
              <Plus /> Add transaction
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/invoices/new">
              <FilePlus2 /> Create invoice
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/banking/import">
              <FileUp /> Import statement
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/import?type=receipt">
              <Camera /> Capture receipt
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal /> Customize
          </Button>
        </div>
      </div>

      <div className="space-y-6">{blocks}</div>

      <CustomizeSheet open={customizing} onOpenChange={setCustomizing} />
    </>
  );
}
