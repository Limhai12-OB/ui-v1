"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FileClock, GitCompareArrows, HelpCircle, Landmark, Upload, Wallet } from "lucide-react";
import type { AccountType, FinancialAccount } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { useLookups } from "@/hooks/use-lookup";
import { cashPosition, currentPeriods, monthlySeries, percentChange, periodTotals } from "@/lib/analytics";
import { formatDate, formatDateTime, previousMonth } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { ConversionNote, ConvertedMoney, Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat";
import { StatusBadge } from "@/components/shared/status-badge";
import { CardsSkeleton, ChartSkeleton, EmptyState } from "@/components/shared/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BankingNav, useReviewCount } from "./banking-nav";
import { ACCOUNT_TYPE_META, accountFlows, last30Start, latestReconciliation } from "./account-utils";
import { FlowChart } from "./flow-chart";

const TYPE_ORDER: AccountType[] = ["bank", "ewallet", "cash"];

export function BankingPage() {
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const imports = useAppStore((s) => s.imports);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const { scope, inScope, money, branch } = useScope();
  const { accountName, branchName } = useLookups();
  const loading = useInitialLoad();
  const review = useReviewCount();

  const cash = useMemo(() => cashPosition(accounts, transactions, scope, money), [accounts, transactions, scope, money]);
  const periods = currentPeriods();
  const mtd = useMemo(() => periodTotals(transactions, periods.start, periods.end, scope, money), [transactions, periods.start, periods.end, scope, money]);
  const prev = useMemo(() => periodTotals(transactions, periods.prevStart, periods.prevEnd, scope, money), [transactions, periods.prevStart, periods.prevEnd, scope, money]);
  const series = useMemo(() => {
    let from = periods.month;
    for (let i = 0; i < 5; i++) from = previousMonth(from);
    return monthlySeries(transactions, from, periods.month, scope, money);
  }, [transactions, periods.month, scope, money]);

  const grouped = useMemo(() => {
    const start = last30Start();
    return TYPE_ORDER.map((type) => ({
      type,
      items: cash.byAccount
        .filter((a) => a.account.type === type)
        .map((a) => ({ ...a, flows: accountFlows(a.account, transactions, start) })),
    })).filter((g) => g.items.length > 0);
  }, [cash.byAccount, transactions]);

  const recentImports = useMemo(() => imports.filter((b) => inScope(b.branchId)).slice(0, 5), [imports, inScope]);
  const bankAccounts = cash.byAccount.filter((a) => a.account.type !== "cash").map((a) => a.account);

  return (
    <>
      <PageHeader
        title="Banking"
        description={`Cash position, statement imports and reconciliation for ${branch ? branch.name : "all branches"}.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/banking/uncategorized">
                <HelpCircle /> Uncategorized
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/banking/import-history">
                <FileClock /> Import history
              </Link>
            </Button>
            <Button asChild>
              <Link href="/banking/import">
                <Upload /> Import statement
              </Link>
            </Button>
          </>
        }
      />
      <BankingNav />

      {loading ? (
        <CardsSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total cash position"
            icon={Wallet}
            value={<ConvertedMoney sum={cash.total} currency={money.display} rate={money.rate} />}
            description={`${cash.byAccount.length} active accounts · as of ${formatDate(periods.end)}`}
          />
          <StatCard label="Money in this month" icon={ArrowDownLeft} value={<ConvertedMoney sum={mtd.revenue} currency={money.display} rate={money.rate} />} delta={percentChange(mtd.revenue.value, prev.revenue.value)} deltaLabel="vs same days last month" description="Posted income" />
          <StatCard label="Money out this month" icon={ArrowUpRight} value={<ConvertedMoney sum={mtd.expenses} currency={money.display} rate={money.rate} />} delta={percentChange(mtd.expenses.value, prev.expenses.value)} invertDelta deltaLabel="vs same days last month" description="Posted expenses" />
          <Card className={review > 0 ? "gap-3 border-warning/40 bg-warning-light/40 p-5" : "gap-3 p-5"}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Needs review</p>
              <span className="flex size-8 items-center justify-center rounded-lg bg-warning-light text-warning-text">
                <HelpCircle className="size-4" aria-hidden />
              </span>
            </div>
            <div className="text-2xl font-semibold tabular-nums">{review}</div>
            <p className="text-xs text-muted-foreground">{review > 0 ? "Imported transactions waiting for a category. They're excluded from reports until confirmed." : "All imported transactions are categorized."}</p>
            {review > 0 && (
              <Button size="sm" variant="outline" className="w-fit" asChild>
                <Link href="/banking/uncategorized">
                  Review now <ChevronRight />
                </Link>
              </Button>
            )}
          </Card>
        </div>
      )}
      <ConversionNote converted={cash.total.converted || mtd.converted} excludedForeign={cash.total.excludedForeign || mtd.excludedForeign} rate={money.rate} currency={money.display} className="mt-2" />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {loading ? (
            <CardsSkeleton count={3} />
          ) : grouped.length === 0 ? (
            <Card>
              <EmptyState icon={Landmark} title="No accounts in this branch" description="Financial accounts assigned to the selected branch will appear here." />
            </Card>
          ) : (
            grouped.map((g) => (
              <section key={g.type} aria-labelledby={`grp-${g.type}`}>
                <SectionHeader title={<span id={`grp-${g.type}`}>{ACCOUNT_TYPE_META[g.type].plural}</span>} />
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {g.items.map(({ account, balance, flows }) => (
                    <AccountCard key={account.id} account={account} balance={balance} moneyIn={flows.moneyIn} moneyOut={flows.moneyOut} branch={branchName(account.branchId)} />
                  ))}
                </div>
              </section>
            ))
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Money in vs money out</CardTitle>
              <p className="text-xs text-muted-foreground">Posted income and expenses by month, {money.display}. Transfers between your own accounts are excluded.</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <ChartSkeleton height={240} />
              ) : (
                <FlowChart
                  ariaLabel="Monthly money in versus money out for the last six months"
                  currency={money.display}
                  data={series.points.map((p) => ({ label: p.label, moneyIn: p.income, moneyOut: p.expenses }))}
                />
              )}
              <ConversionNote converted={series.converted} excludedForeign={series.excludedForeign} rate={money.rate} currency={money.display} className="mt-3" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-medium">Reconciliation status</h2>
              <GitCompareArrows className="size-4 text-muted-foreground" aria-hidden />
            </div>
            <ul className="divide-y">
              {bankAccounts.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No bank or e-wallet accounts in scope.</li>}
              {bankAccounts.map((a) => {
                const rec = latestReconciliation(a.id, reconciliations);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{rec ? `${formatDate(rec.periodStart, "dd MMM")} – ${formatDate(rec.periodEnd)}` : "Never reconciled"}</p>
                    </div>
                    {rec ? (
                      <Link href={`/reconciliation/${rec.id}`} className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Open reconciliation for ${a.name}`}>
                        <StatusBadge status={rec.status} />
                      </Link>
                    ) : (
                      <Button size="xs" variant="outline" asChild>
                        <Link href={`/reconciliation/new?account=${a.id}`}>Start</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-medium">Recent imports</h2>
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <Link href="/banking/import-history">View all</Link>
              </Button>
            </div>
            {recentImports.length === 0 ? (
              <EmptyState compact icon={FileClock} title="No imports yet" description="Imported statements and documents appear here." />
            ) : (
              <ul className="divide-y">
                {recentImports.map((b) => (
                  <li key={b.id}>
                    <Link href={`/banking/import-history?batch=${b.id}`} className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.accountId ? accountName(b.accountId) : branchName(b.branchId)} · {formatDateTime(b.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={b.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AccountCard({ account, balance, moneyIn, moneyOut, branch }: { account: FinancialAccount; balance: number; moneyIn: number; moneyOut: number; branch: string }) {
  const Icon = ACCOUNT_TYPE_META[account.type].icon;
  return (
    <Card className="gap-0 p-0 transition-colors hover:border-primary/40">
      <Link href={`/accounts/${account.id}`} className="block rounded-xl p-5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p className="text-xs text-muted-foreground">
                {account.provider} · <span className="tabular-nums">{account.accountNumber}</span> · {account.currency}
              </p>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Current balance</p>
        <Money amount={balance} currency={account.currency} className="text-xl font-semibold" />
        <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
          <div>
            <p className="text-muted-foreground">In · 30 days</p>
            <Money amount={moneyIn} currency={account.currency} className="font-medium text-success-text" />
          </div>
          <div>
            <p className="text-muted-foreground">Out · 30 days</p>
            <Money amount={moneyOut} currency={account.currency} className="font-medium" />
          </div>
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground">{branch}</p>
      </Link>
    </Card>
  );
}
