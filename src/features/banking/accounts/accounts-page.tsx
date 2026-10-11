"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Wallet } from "lucide-react";
import type { FinancialAccount } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { accountBalance } from "@/lib/domain";
import { cashPosition } from "@/lib/analytics";
import { formatDate, relativeDays } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { ConversionNote, ConvertedMoney, Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BankingNav } from "../banking-nav";
import { ACCOUNT_TYPE_META, lastActivity } from "../account-utils";

interface Row {
  account: FinancialAccount;
  balance: number;
  last?: string;
}

export function AccountsPage() {
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const { inScope, scope, money } = useScope();
  const { branchName } = useLookups();
  const canManage = useCan("accounts.manage");
  const loading = useInitialLoad();
  const router = useRouter();

  const data = useMemo<Row[]>(
    () => accounts.filter((a) => inScope(a.branchId)).map((account) => ({ account, balance: accountBalance(account, transactions), last: lastActivity(account.id, transactions) })),
    [accounts, transactions, inScope],
  );
  const cash = useMemo(() => cashPosition(accounts, transactions, scope, money), [accounts, transactions, scope, money]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "name",
        accessorFn: (r) => r.account.name,
        header: ({ column }) => <SortHeader column={column} title="Account" />,
        meta: { label: "Account" },
        cell: ({ row }) => {
          const Icon = ACCOUNT_TYPE_META[row.original.account.type].icon;
          return (
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <Link href={`/accounts/${row.original.account.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {row.original.account.name}
                </Link>
                {row.original.account.status === "archived" && <StatusBadge status="archived" className="ml-2" />}
              </div>
            </div>
          );
        },
      },
      { id: "type", accessorFn: (r) => r.account.type, header: "Type", meta: { label: "Type" }, cell: ({ row }) => ACCOUNT_TYPE_META[row.original.account.type].label },
      { id: "provider", accessorFn: (r) => r.account.provider, header: "Provider", meta: { label: "Provider" } },
      { id: "number", accessorFn: (r) => r.account.accountNumber, header: "Number", meta: { label: "Number" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{getValue() as string}</span> },
      { id: "currency", accessorFn: (r) => r.account.currency, header: "Currency", meta: { label: "Currency" } },
      { id: "branch", accessorFn: (r) => branchName(r.account.branchId), header: "Branch", meta: { label: "Branch" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      {
        id: "balance",
        accessorFn: (r) => r.balance,
        header: ({ column }) => <SortHeader column={column} title="Current balance" align="right" />,
        meta: { align: "right", label: "Current balance" },
        sortingFn: (a, b) => (a.original.account.currency === b.original.account.currency ? a.original.balance - b.original.balance : a.original.account.currency.localeCompare(b.original.account.currency)),
        cell: ({ row }) => <Money amount={row.original.balance} currency={row.original.account.currency} className="font-medium" />,
      },
      {
        id: "last",
        accessorFn: (r) => r.last ?? "",
        header: ({ column }) => <SortHeader column={column} title="Last activity" />,
        meta: { label: "Last activity" },
        cell: ({ row }) => (row.original.last ? <span className="whitespace-nowrap" title={formatDate(row.original.last)}>{relativeDays(row.original.last)}</span> : <span className="text-muted-foreground">No activity</span>),
      },
    ],
    [branchName],
  );

  return (
    <>
      <PageHeader
        title="Financial accounts"
        description="Bank accounts, e-wallets and cash drawers. Balances are calculated from the opening balance and every posted or imported transaction."
        actions={
          canManage && (
            <Button asChild>
              <Link href="/accounts/new">
                <Plus /> New account
              </Link>
            </Button>
          )
        }
      />
      <BankingNav />
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-muted-foreground">Total cash position</span>
        <ConvertedMoney sum={cash.total} currency={money.display} rate={money.rate} className="text-xl font-semibold" />
        <ConversionNote converted={cash.total.converted} excludedForeign={cash.total.excludedForeign} rate={money.rate} currency={money.display} className="w-full" />
      </div>
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          getRowId={(r) => r.account.id}
          onRowClick={(r) => router.push(`/accounts/${r.account.id}`)}
          searchPlaceholder="Search accounts…"
          searchFn={(r, q) => `${r.account.name} ${r.account.provider} ${r.account.accountNumber}`.toLowerCase().includes(q)}
          facets={[
            { columnId: "type", label: "Types", options: [{ value: "bank", label: "Bank" }, { value: "ewallet", label: "E-wallet" }, { value: "cash", label: "Cash" }] },
            { columnId: "currency", label: "Currencies", options: [{ value: "USD", label: "USD" }, { value: "KHR", label: "KHR" }] },
          ]}
          initialSorting={[{ id: "name", desc: false }]}
          empty={
            <EmptyState
              icon={Wallet}
              title="No accounts in this branch"
              description={canManage ? "Add a bank account, e-wallet or cash drawer to start tracking balances." : "The Business Owner manages financial accounts."}
              action={
                canManage && (
                  <Button size="sm" asChild>
                    <Link href="/accounts/new">
                      <Plus /> New account
                    </Link>
                  </Button>
                )
              }
            />
          }
        />
      </Card>
    </>
  );
}
