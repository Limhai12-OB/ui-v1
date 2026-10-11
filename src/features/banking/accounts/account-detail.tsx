"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownLeft, ArrowUpRight, GitCompareArrows, Scale, Upload, Wallet, X } from "lucide-react";
import type { Transaction } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { accountBalance, transactionEffect } from "@/lib/domain";
import { roundMoney } from "@/lib/currency";
import { addDaysISO, formatDate, relativeDays, today } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailList } from "@/components/shared/detail-list";
import { ChartSkeleton, EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ImportHistoryPage } from "../import-history-page";
import { ACCOUNT_TYPE_META, accountFlows, lastActivity, touchesAccount } from "../account-utils";
import { FlowChart, type FlowPoint } from "../flow-chart";

const TYPE_LABEL: Record<Transaction["type"], string> = { income: "Income", expense: "Expense", transfer: "Transfer" };

export function AccountDetail({ id }: { id: string }) {
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const categories = useAppStore((s) => s.categories);
  const { inScope } = useScope();
  const { branchName, categoryName, accountName } = useLookups();
  const loading = useInitialLoad();
  const router = useRouter();
  const [range, setRange] = useState<"30" | "90">("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const account = accounts.find((a) => a.id === id);
  const visible = account && inScope(account.branchId);

  const txs = useMemo(() => (account ? transactions.filter((t) => touchesAccount(t, account.id)) : []), [transactions, account]);
  const days = Number(range);
  const start = addDaysISO(today(), -(days - 1));
  const flows = useMemo(() => (account ? accountFlows(account, txs, start) : undefined), [account, txs, start]);
  const balance = account ? accountBalance(account, transactions) : 0;

  const series = useMemo<FlowPoint[]>(() => {
    if (!account) return [];
    const bucket = days === 30 ? 1 : 7;
    const points: (FlowPoint & { start: string; end: string })[] = [];
    for (let d = start; d <= today(); d = addDaysISO(d, bucket)) {
      const end = addDaysISO(d, bucket - 1) > today() ? today() : addDaysISO(d, bucket - 1);
      points.push({ start: d, end, label: formatDate(d, "d MMM"), moneyIn: 0, moneyOut: 0 });
    }
    for (const t of txs) {
      if (t.date < start || t.date > today()) continue;
      const p = points.find((x) => t.date >= x.start && t.date <= x.end);
      if (!p) continue;
      const e = transactionEffect(t, account.id);
      if (e > 0) p.moneyIn += e;
      else p.moneyOut -= e;
    }
    return points.map((p) => ({ label: p.label, moneyIn: roundMoney(p.moneyIn, account.currency), moneyOut: roundMoney(p.moneyOut, account.currency) }));
  }, [account, txs, start, days]);

  const filtered = useMemo(() => txs.filter((t) => (!from || t.date >= from) && (!to || t.date <= to)), [txs, from, to]);
  const recons = useMemo(() => reconciliations.filter((r) => r.accountId === id).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)), [reconciliations, id]);
  const stats = useMemo(
    () => ({
      count: txs.length,
      review: txs.filter((t) => t.status === "needs_review").length,
      unreconciled: txs.filter((t) => !t.reconciled).length,
      last: account ? lastActivity(account.id, txs) : undefined,
    }),
    [txs, account],
  );

  const columns = useMemo<ColumnDef<Transaction, unknown>[]>(
    () => [
      { accessorKey: "date", header: ({ column }) => <SortHeader column={column} title="Date" />, meta: { label: "Date" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue() as string)}</span> },
      {
        accessorKey: "description",
        header: "Description",
        meta: { label: "Description" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/transactions/${row.original.id}`} className="block max-w-80 truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.description}
            </Link>
            <p className="max-w-80 truncate text-xs text-muted-foreground">
              {row.original.type === "transfer" ? `${accountName(row.original.accountId)} → ${accountName(row.original.toAccountId)}` : (row.original.counterparty ?? row.original.reference ?? "")}
            </p>
          </div>
        ),
      },
      { id: "type", accessorFn: (t) => t.type, header: "Type", meta: { label: "Type" }, cell: ({ row }) => <Badge variant="outline">{TYPE_LABEL[row.original.type]}</Badge> },
      { id: "category", accessorFn: (t) => t.categoryId ?? "uncategorized", header: "Category", meta: { label: "Category" }, cell: ({ row }) => (row.original.type === "transfer" ? <span className="text-muted-foreground">—</span> : categoryName(row.original.categoryId)) },
      {
        id: "status",
        accessorFn: (t) => t.status,
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.reconciled && <StatusBadge status="reconciled" />}
          </div>
        ),
      },
      {
        id: "amount",
        accessorFn: (t) => transactionEffect(t, id),
        header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />,
        meta: { align: "right", label: "Amount" },
        cell: ({ row }) => <Money amount={transactionEffect(row.original, id)} currency={row.original.currency} tone />,
      },
    ],
    [id, accountName, categoryName],
  );

  if (!account || !visible) {
    return (
      <EmptyState
        icon={Wallet}
        title={account ? "This account belongs to another branch" : "Account not found"}
        description={account ? "You can only view accounts for branches you have access to." : "The account may have been removed or the link is incorrect."}
        action={
          <Button asChild>
            <Link href="/accounts">Back to accounts</Link>
          </Button>
        }
        className="min-h-[50vh]"
      />
    );
  }

  const Icon = ACCOUNT_TYPE_META[account.type].icon;
  const usedCategories = categories.filter((c) => c.kind !== "item" && txs.some((t) => t.categoryId === c.id));

  return (
    <>
      <PageHeader
        backHref="/accounts"
        backLabel="Accounts"
        title={account.name}
        meta={
          <>
            <Badge variant="outline">
              <Icon /> {ACCOUNT_TYPE_META[account.type].label}
            </Badge>
            <StatusBadge status={account.status} />
          </>
        }
        description={`${account.provider} · ${account.accountNumber} · ${account.currency} · ${branchName(account.branchId)}`}
        actions={
          <>
            {account.type !== "cash" && (
              <Button variant="outline" asChild>
                <Link href={`/reconciliation/new?account=${account.id}`}>
                  <GitCompareArrows /> Reconcile
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={`/banking/import?account=${account.id}`}>
                <Upload /> Import statement
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current balance" icon={Wallet} value={<Money amount={balance} currency={account.currency} />} description={`As of ${formatDate(today())}`} />
        <StatCard label={`Money in · ${range} days`} icon={ArrowDownLeft} value={<Money amount={flows?.moneyIn ?? 0} currency={account.currency} />} description="Incl. transfers in" />
        <StatCard label={`Money out · ${range} days`} icon={ArrowUpRight} value={<Money amount={flows?.moneyOut ?? 0} currency={account.currency} />} description="Incl. transfers out" />
        <StatCard label={`Net change · ${range} days`} icon={Scale} value={<Money amount={flows?.net ?? 0} currency={account.currency} tone />} description={`${flows?.count ?? 0} transactions`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Inflow and outflow</CardTitle>
              <p className="text-xs text-muted-foreground">{range === "30" ? "Daily" : "Weekly"} totals in {account.currency}, including transfers.</p>
            </div>
            <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v as "30" | "90")} aria-label="Chart range">
              <ToggleGroupItem value="30">30 days</ToggleGroupItem>
              <ToggleGroupItem value="90">90 days</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>{loading ? <ChartSkeleton height={240} /> : <FlowChart data={series} currency={account.currency} ariaLabel={`Money in and out of ${account.name} over the last ${range} days`} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              columns={1}
              items={[
                { label: "Opening balance", value: <><Money amount={account.openingBalance} currency={account.currency} /> on {formatDate(account.openingDate)}</> },
                { label: "Transactions", value: <span className="tabular-nums">{stats.count.toLocaleString("en-US")}</span> },
                {
                  label: "Needs review",
                  value: stats.review ? (
                    <Link href="/banking/uncategorized" className="font-medium text-warning-text hover:underline">
                      {stats.review} uncategorized
                    </Link>
                  ) : (
                    "None"
                  ),
                },
                { label: "Not yet reconciled", value: <span className="tabular-nums">{stats.unreconciled}</span> },
                { label: "Last activity", value: stats.last ? `${formatDate(stats.last)} (${relativeDays(stats.last)})` : "No activity" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <SectionHeader title="Transactions" description="Every transaction that moves money in or out of this account." />
        <Card className="gap-0 py-0">
          <DataTable
            columns={columns}
            data={filtered}
            loading={loading}
            getRowId={(t) => t.id}
            onRowClick={(t) => router.push(`/transactions/${t.id}`)}
            searchPlaceholder="Search transactions…"
            searchFn={(t, q) => `${t.description} ${t.counterparty ?? ""} ${t.reference ?? ""}`.toLowerCase().includes(q)}
            facets={[
              { columnId: "type", label: "Types", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }, { value: "transfer", label: "Transfer" }] },
              { columnId: "category", label: "Categories", options: [{ value: "uncategorized", label: "Uncategorized" }, ...usedCategories.map((c) => ({ value: c.id, label: c.name }))] },
              { columnId: "status", label: "Statuses", options: [{ value: "posted", label: "Posted" }, { value: "needs_review", label: "Needs review" }] },
            ]}
            toolbar={
              <div className="flex flex-wrap items-center gap-1.5">
                <Input type="date" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" aria-label="From date" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={to} min={from || undefined} max={today()} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" aria-label="To date" />
                {(from || to) && (
                  <Button variant="ghost" size="icon-sm" aria-label="Clear date range" onClick={() => (setFrom(""), setTo(""))}>
                    <X />
                  </Button>
                )}
              </div>
            }
            initialSorting={[{ id: "date", desc: true }]}
            empty={<EmptyState compact title="No transactions yet" description="Import a statement or record a transaction to see activity here." />}
          />
        </Card>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section>
          <SectionHeader
            title="Reconciliation history"
            actions={
              account.type !== "cash" && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/reconciliation/new?account=${account.id}`}>Start reconciliation</Link>
                </Button>
              )
            }
          />
          <Card className="gap-0 py-0">
            {recons.length === 0 ? (
              <EmptyState compact icon={GitCompareArrows} title="Never reconciled" description={account.type === "cash" ? "Cash drawers are balanced through Till balancing." : "Match this account's statement against the ledger to confirm the balance."} />
            ) : (
              <ul className="divide-y">
                {recons.map((r) => (
                  <li key={r.id}>
                    <Link href={`/reconciliation/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none">
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(r.periodStart, "dd MMM")} – {formatDate(r.periodEnd)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.lines.length} statement lines · {r.lines.filter((l) => l.state === "matched").length} matched
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
        <section>
          <SectionHeader title="Import history" />
          <ImportHistoryPage accountId={account.id} embedded />
        </section>
      </div>
    </>
  );
}
