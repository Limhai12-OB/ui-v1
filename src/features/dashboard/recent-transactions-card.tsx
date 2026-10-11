"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Receipt } from "lucide-react";
import type { Transaction } from "@/types";
import { useLookups } from "@/hooks/use-lookup";
import { formatDate } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { DataTable } from "@/components/tables/data-table";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export function RecentTransactionsCard({ transactions, loading }: { transactions: Transaction[]; loading: boolean }) {
  const router = useRouter();
  const { categoryName, accountName } = useLookups();

  const columns = useMemo<ColumnDef<Transaction, unknown>[]>(
    () => [
      { accessorKey: "date", header: "Date", cell: ({ getValue }) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(getValue() as string, "dd MMM")}</span> },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="max-w-[280px] min-w-[160px]">
            <p className="truncate font-medium">{row.original.description}</p>
            {row.original.counterparty && <p className="truncate text-xs text-muted-foreground">{row.original.counterparty}</p>}
          </div>
        ),
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.type === "transfer" ? "Transfer" : categoryName(row.original.categoryId)}</span>,
      },
      { id: "account", header: "Account", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{accountName(row.original.accountId)}</span> },
      {
        id: "amount",
        header: "Amount",
        meta: { align: "right" },
        cell: ({ row }) => {
          const t = row.original;
          const sign = t.type === "income" ? "+" : t.type === "expense" ? "−" : "";
          return (
            <span className={cn("font-medium whitespace-nowrap tabular-nums", t.type === "income" && "text-success-text")}>
              {sign}
              {formatMoney(t.amount, t.currency)}
              <span className="sr-only">{t.type === "income" ? " money in" : t.type === "expense" ? " money out" : " transfer"}</span>
            </span>
          );
        },
      },
      { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [categoryName, accountName],
  );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Recent transactions</CardTitle>
        <CardDescription>The 8 latest transactions in this scope.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <div className="overflow-x-auto">
        <DataTable
          bare
          columns={columns}
          data={transactions}
          loading={loading}
          pageSize={8}
          getRowId={(t) => t.id}
          onRowClick={(t) => router.push(`/transactions/${t.id}`)}
          empty={
            <EmptyState
              compact
              icon={Receipt}
              title="No transactions yet"
              description="Record income or an expense to see it here."
              action={
                <Button size="sm" asChild>
                  <Link href="/transactions/new">Add transaction</Link>
                </Button>
              }
            />
          }
        />
      </div>
    </Card>
  );
}
