"use client";

import { Banknote, FileClock, HandCoins, Percent, TrendingUp, Wallet } from "lucide-react";
import type { MoneyContext, PayablesSummary, PeriodTotals, ReceivablesSummary } from "@/lib/analytics";
import { percentChange } from "@/lib/analytics";
import { formatPercent } from "@/lib/currency";
import { StatCard } from "@/components/shared/stat";
import { ConvertedMoney } from "@/components/shared/money";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiGridProps {
  current: PeriodTotals;
  previous: PeriodTotals;
  ar: ReceivablesSummary;
  ap: PayablesSummary;
  money: MoneyContext;
  compareLabel: string;
  loading: boolean;
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6";

export function KpiGrid({ current, previous, ar, ap, money, compareLabel, loading }: KpiGridProps) {
  if (loading)
    return (
      <div className={GRID} aria-busy="true" aria-label="Loading key figures">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
    );

  const { display: cur, rate } = money;
  const netSum = { value: current.net, converted: current.converted, excludedForeign: current.excludedForeign };
  const marginDelta = current.margin !== null && previous.margin !== null ? current.margin - previous.margin : null;
  const pp = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)} pp`;

  return (
    <div className={GRID}>
      <StatCard
        label="Monthly revenue"
        icon={TrendingUp}
        value={<ConvertedMoney sum={current.revenue} currency={cur} rate={rate} />}
        delta={percentChange(current.revenue.value, previous.revenue.value)}
        deltaLabel={compareLabel}
      />
      <StatCard
        label="Monthly expenses"
        icon={Wallet}
        value={<ConvertedMoney sum={current.expenses} currency={cur} rate={rate} />}
        delta={percentChange(current.expenses.value, previous.expenses.value)}
        invertDelta
        deltaLabel={compareLabel}
      />
      <StatCard
        label="Net profit"
        icon={Banknote}
        value={<ConvertedMoney sum={netSum} currency={cur} rate={rate} className={current.net < 0 ? "text-error-text" : undefined} />}
        delta={percentChange(current.net, previous.net)}
        deltaLabel={compareLabel}
        description={current.net < 0 ? "Spending exceeds income this month" : undefined}
      />
      <StatCard
        label="Profit margin"
        icon={Percent}
        value={current.margin === null ? "—" : formatPercent(current.margin, 1)}
        delta={marginDelta}
        formatDelta={pp}
        deltaLabel={compareLabel}
        description={current.margin === null ? "No revenue recorded yet this month" : "Net profit as a share of revenue"}
      />
      <StatCard
        label="Accounts receivable"
        icon={HandCoins}
        value={<ConvertedMoney sum={ar.total} currency={cur} rate={rate} />}
        description={
          <>
            {ar.overdueCount > 0 ? (
              <span className="block font-medium text-error-text">
                <ConvertedMoney sum={ar.overdue} currency={cur} rate={rate} /> overdue · {ar.overdueCount} invoice{ar.overdueCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="block">None overdue</span>
            )}
            <span className="block">{ar.count} open invoice{ar.count === 1 ? "" : "s"}</span>
          </>
        }
      />
      <StatCard
        label="Accounts payable"
        icon={FileClock}
        value={<ConvertedMoney sum={ap.total} currency={cur} rate={rate} />}
        description={
          <>
            {ap.overdueCount > 0 ? (
              <span className="block font-medium text-error-text">
                <ConvertedMoney sum={ap.overdue} currency={cur} rate={rate} /> overdue · {ap.overdueCount} bill{ap.overdueCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="block">None overdue</span>
            )}
            <span className="block">
              {ap.dueSoonCount > 0 ? (
                <>
                  <ConvertedMoney sum={ap.dueSoon} currency={cur} rate={rate} /> due in 14 days · {ap.dueSoonCount} bill{ap.dueSoonCount === 1 ? "" : "s"}
                </>
              ) : (
                "Nothing due in the next 14 days"
              )}
            </span>
          </>
        }
      />
    </div>
  );
}
