"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Building2, Calculator, ChevronRight, GitCompareArrows, Mail, Package, Pencil, Percent, Phone, Star, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { currentPeriods, percentChange, periodTotals } from "@/lib/analytics";
import { accountBalance, lowStockEntries, stockLevel } from "@/lib/domain";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat";
import { ConvertedMoney, ConversionNote, Money } from "@/components/shared/money";
import { DetailList } from "@/components/shared/detail-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BranchDetail({ id }: { id: string }) {
  const loading = useInitialLoad();
  const branch = useAppStore((s) => s.branches.find((b) => b.id === id));
  const managers = useAppStore((s) => s.managers);
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const items = useAppStore((s) => s.items);
  const tills = useAppStore((s) => s.tillSessions);
  const recons = useAppStore((s) => s.reconciliations);
  const { money } = useScope();
  const { categoryName, accountName } = useLookups();
  const p = currentPeriods();

  const data = useMemo(() => {
    if (!branch) return null;
    const scope = { branchIds: [branch.id] };
    const cur = periodTotals(transactions, p.start, p.end, scope, money);
    const prev = periodTotals(transactions, p.prevStart, p.prevEnd, scope, money);
    const branchAccounts = accounts.filter((a) => a.branchId === branch.id).map((a) => ({ account: a, balance: accountBalance(a, transactions) }));
    const recent = transactions
      .filter((t) => t.branchId === branch.id)
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
      .slice(0, 8);
    const low = lowStockEntries(items, branch.id).sort((a, b) => a.qty - b.qty);
    const branchTills = tills.filter((t) => t.branchId === branch.id).sort((a, b) => b.date.localeCompare(a.date));
    const branchRecons = recons.filter((r) => r.branchId === branch.id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    return { cur, prev, branchAccounts, recent, low, branchTills, branchRecons };
  }, [branch, transactions, accounts, items, tills, recons, money, p.start, p.end, p.prevStart, p.prevEnd]);

  if (loading) return <PageSkeleton />;
  if (!branch || !data) {
    return (
      <EmptyState
        icon={Building2}
        title="Branch not found"
        description="This branch doesn’t exist or was removed."
        action={
          <Button asChild>
            <Link href="/branches">Back to branches</Link>
          </Button>
        }
        className="min-h-[50vh]"
      />
    );
  }

  const manager = managers.find((m) => m.id === branch.managerId && m.branchId === branch.id);
  const { cur, prev } = data;
  const marginDelta = cur.margin !== null && prev.margin !== null ? cur.margin - prev.margin : null;
  const awaitingTills = data.branchTills.filter((t) => t.status === "submitted").length;
  const awaitingRecons = data.branchRecons.filter((r) => r.status === "submitted").length;
  const lastTill = data.branchTills[0];
  const lastRecon = data.branchRecons[0];

  return (
    <>
      <PageHeader
        backHref="/branches"
        backLabel="Branches"
        title={branch.name}
        meta={
          <>
            <StatusBadge status={branch.status} />
            {branch.isMain && (
              <Badge variant="secondary">
                <Star /> Main branch
              </Badge>
            )}
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs">{branch.code}</span>
            <span>
              {branch.address}, {branch.city}
            </span>
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/branches/${branch.id}/edit`}>
              <Pencil /> Edit branch
            </Link>
          </Button>
        }
      />

      <SectionHeader title="This month so far" description={`1–${Number(p.end.slice(8))} ${formatDate(p.end, "MMM yyyy")}, compared with the same days last month`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" icon={ArrowUpRight} value={<ConvertedMoney sum={cur.revenue} currency={money.display} rate={money.rate} />} delta={percentChange(cur.revenue.value, prev.revenue.value)} deltaLabel="vs last month" />
          <StatCard label="Expenses" icon={ArrowDownRight} value={<ConvertedMoney sum={cur.expenses} currency={money.display} rate={money.rate} />} delta={percentChange(cur.expenses.value, prev.expenses.value)} invertDelta deltaLabel="vs last month" />
          <StatCard
            label="Net profit"
            icon={TrendingUp}
            value={<span className={cn(cur.net < 0 && "text-error-text")}>{cur.converted && "≈ "}{formatMoney(cur.net, money.display, { signed: true })}</span>}
            delta={percentChange(cur.net, prev.net)}
            deltaLabel="vs last month"
          />
          <StatCard
            label="Profit margin"
            icon={Percent}
            value={cur.margin !== null ? `${cur.margin.toFixed(1)}%` : "—"}
            description={marginDelta !== null ? `${marginDelta >= 0 ? "+" : ""}${marginDelta.toFixed(1)} pts vs last month (${prev.margin!.toFixed(1)}%)` : "Not enough revenue to compare"}
          />
        </div>
      <ConversionNote converted={cur.converted} excludedForeign={cur.excludedForeign} rate={money.rate} currency={money.display} className="mt-3" />

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b py-4">
              <CardTitle className="text-base">Accounts</CardTitle>
              <span className="text-xs text-muted-foreground">Balances as of {formatDate(p.end)}</span>
            </CardHeader>
            {data.branchAccounts.length === 0 ? (
              <EmptyState compact icon={Wallet} title="No accounts in this branch" />
            ) : (
              <ul className="divide-y">
                {data.branchAccounts.map(({ account, balance }) => (
                  <li key={account.id}>
                    <Link href={`/accounts/${account.id}`} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold">{account.provider === "Cash" ? <Wallet className="size-4" aria-hidden /> : account.provider.slice(0, 2)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{account.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {account.provider} · {account.accountNumber} · {account.currency}
                          {account.status === "archived" && " · archived"}
                        </span>
                      </span>
                      <Money amount={balance} currency={account.currency} className={cn("text-sm font-medium", balance < 0 && "text-error-text")} />
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b py-4">
              <CardTitle className="text-base">Recent transactions</CardTitle>
              <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href="/transactions">View all</Link>
              </Button>
            </CardHeader>
            {data.recent.length === 0 ? (
              <EmptyState compact title="No transactions yet" description="Transactions recorded for this branch will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Recent transactions for {branch.name}</caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th scope="col" className="px-6 py-2 text-left font-medium">Date</th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">Description</th>
                      <th scope="col" className="px-2 py-2 text-left font-medium">Category</th>
                      <th scope="col" className="px-6 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.recent.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/40">
                        <td className="px-6 py-2.5 whitespace-nowrap tabular-nums text-muted-foreground">{formatDate(t.date, "dd MMM")}</td>
                        <td className="max-w-64 px-2 py-2.5">
                          <Link href={`/transactions/${t.id}`} className="block truncate font-medium hover:underline">
                            {t.description}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">{accountName(t.accountId)}</span>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{t.type === "transfer" ? <span className="text-muted-foreground">Transfer</span> : t.status === "needs_review" ? <StatusBadge status="needs_review" /> : categoryName(t.categoryId)}</td>
                        <td className="px-6 py-2.5 text-right">
                          <Money amount={t.type === "expense" ? -t.amount : t.amount} currency={t.currency} tone={t.type !== "transfer"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branch manager</CardTitle>
            </CardHeader>
            <CardContent>
              {manager ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary" aria-hidden>
                      {manager.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{manager.name}</p>
                      <StatusBadge status={manager.status} />
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><Mail className="size-3.5" aria-hidden /> <span className="truncate">{manager.email}</span></li>
                    <li className="flex items-center gap-2"><Phone className="size-3.5" aria-hidden /> {manager.phone}</li>
                  </ul>
                  <p className="text-xs text-muted-foreground">{manager.status === "invited" ? `Invited ${formatDateTime(manager.invitedAt)} — waiting to accept.` : manager.lastActiveAt ? `Last active ${formatDateTime(manager.lastActiveAt)}` : `Joined ${formatDate(manager.joinedAt)}`}</p>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/branch-managers">Manage branch managers</Link>
                  </Button>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={UserPlus}
                  title={branch.isMain ? "Managed by the Business Owner" : "No manager assigned"}
                  description={branch.isMain ? "You can still invite a dedicated manager for this branch." : "Invite a branch manager to run day-to-day operations here."}
                  action={
                    <Button asChild size="sm">
                      <Link href={`/branch-managers/invite?branch=${branch.id}`}>
                        <UserPlus /> Invite manager
                      </Link>
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ControlLink href="/till-balancing" icon={Calculator} title="Till balancing" detail={lastTill ? `Last count ${formatDate(lastTill.date)}` : "No till counts yet"} badge={awaitingTills ? <Badge variant="warning" className="tabular-nums">{awaitingTills} awaiting sign-off</Badge> : lastTill ? <StatusBadge status={lastTill.status} /> : undefined} />
              <ControlLink href="/reconciliation" icon={GitCompareArrows} title="Bank reconciliation" detail={lastRecon ? `Latest period ends ${formatDate(lastRecon.periodEnd)}` : "No reconciliations yet"} badge={awaitingRecons ? <Badge variant="warning" className="tabular-nums">{awaitingRecons} awaiting sign-off</Badge> : lastRecon ? <StatusBadge status={lastRecon.status} /> : undefined} />
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b py-4">
              <CardTitle className="text-base">Low stock</CardTitle>
              {data.low.length > 0 && <Badge variant="warning" className="tabular-nums">{data.low.length}</Badge>}
            </CardHeader>
            {data.low.length === 0 ? (
              <EmptyState compact icon={Package} title="Stock levels are healthy" description="No items are at or below their reorder level." />
            ) : (
              <ul className="divide-y">
                {data.low.slice(0, 6).map(({ item, qty }) => (
                  <li key={item.id}>
                    <Link href={`/items/${item.id}`} className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {qty} {item.unit} · reorder at {item.reorderLevel}
                        </span>
                      </span>
                      <StatusBadge status={stockLevel(qty, item.reorderLevel)} />
                    </Link>
                  </li>
                ))}
                {data.low.length > 6 && (
                  <li className="px-6 py-2.5 text-center">
                    <Link href="/items" className="text-sm font-medium text-primary hover:underline">
                      View all {data.low.length} items
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: "Phone", value: branch.phone },
                  { label: "Opened", value: formatDate(branch.openedAt) },
                  { label: "Code", value: <span className="font-mono">{branch.code}</span> },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ControlLink({ href, icon: Icon, title, detail, badge }: { href: string; icon: typeof Calculator; title: string; detail: string; badge?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {badge}
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
