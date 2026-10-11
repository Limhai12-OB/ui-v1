"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarClock, FileText, Plus, ReceiptText, Wallet } from "lucide-react";
import type { Bill, BillStatus } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { billStatus, billTotals } from "@/lib/domain";
import { payables } from "@/lib/analytics";
import { formatDate } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money, ConvertedMoney, ConversionNote } from "@/components/shared/money";
import { CardsSkeleton, EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { BILL_STATUS_LABEL, BILL_STATUS_ORDER, dueInfo } from "./bill-utils";

type Row = Bill & { status: BillStatus; paid: number; balance: number };

export function BillsPage() {
  const router = useRouter();
  const bills = useAppStore((s) => s.bills);
  const categories = useAppStore((s) => s.categories);
  const { scope, inScope, isOwner, branches, branch, money } = useScope();
  const { branchName, categoryName } = useLookups();
  const loading = useInitialLoad();
  const [tab, setTab] = useState<"all" | BillStatus>("all");

  const rows = useMemo<Row[]>(
    () =>
      bills
        .filter((b) => inScope(b.branchId))
        .map((b) => {
          const { paid, balance } = billTotals(b);
          return { ...b, status: billStatus(b), paid, balance };
        }),
    [bills, inScope],
  );

  const summary = useMemo(() => payables(bills, scope, money), [bills, scope, money]);

  const counts = useMemo(() => {
    const m = new Map<BillStatus, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  const data = tab === "all" ? rows : rows.filter((r) => r.status === tab);
  const showBranch = isOwner && !branch;

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <SortHeader column={column} title="Number" />,
        meta: { label: "Number" },
        cell: ({ row }) => <span className="font-medium whitespace-nowrap tabular-nums">{row.original.number}</span>,
      },
      {
        accessorKey: "supplier",
        header: ({ column }) => <SortHeader column={column} title="Supplier" />,
        meta: { label: "Supplier" },
        cell: ({ row }) => (
          <div className="max-w-72 min-w-44">
            <p className="truncate font-medium text-foreground">{row.original.supplier}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        id: "branch",
        accessorFn: (r) => r.branchId,
        header: "Branch",
        meta: { label: "Branch" },
        cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span>,
      },
      {
        id: "category",
        accessorFn: (r) => r.categoryId,
        header: "Category",
        meta: { label: "Category" },
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{categoryName(row.original.categoryId)}</span>,
      },
      {
        accessorKey: "issueDate",
        header: ({ column }) => <SortHeader column={column} title="Bill date" />,
        meta: { label: "Bill date" },
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.original.issueDate)}</span>,
      },
      {
        accessorKey: "dueDate",
        header: ({ column }) => <SortHeader column={column} title="Due date" />,
        meta: { label: "Due date" },
        cell: ({ row }) => {
          const due = dueInfo(row.original, row.original.status);
          return (
            <div className="whitespace-nowrap">
              <p className="tabular-nums">{formatDate(row.original.dueDate)}</p>
              {due.label && (
                <p className={cn("text-xs", due.tone === "overdue" ? "font-medium text-error-text" : due.tone === "soon" ? "text-warning-text" : "text-muted-foreground")}>
                  {due.tone === "overdue" && <AlertTriangle className="mr-1 inline size-3 align-[-2px]" aria-hidden />}
                  {due.label}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />,
        meta: { align: "right", label: "Amount" },
        cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.currency} />,
      },
      {
        accessorKey: "balance",
        header: ({ column }) => <SortHeader column={column} title="Balance" align="right" />,
        meta: { align: "right", label: "Balance" },
        cell: ({ row }) =>
          row.original.status === "void" ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Money amount={row.original.balance} currency={row.original.currency} className={cn(row.original.balance === 0 ? "text-muted-foreground" : "font-medium")} />
          ),
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [branchName, categoryName],
  );

  const branchOptions = branches.map((b) => ({ label: b.name, value: b.id }));
  const categoryOptions = useMemo(() => {
    const used = new Set(rows.map((r) => r.categoryId));
    return categories.filter((c) => used.has(c.id)).map((c) => ({ label: c.name, value: c.id }));
  }, [categories, rows]);

  const scopeLabel = branch ? branch.name : "all branches";

  return (
    <>
      <PageHeader
        title="Bills"
        description={`Supplier bills and payables for ${scopeLabel}. Track what's due, record payments and keep suppliers paid on time.`}
        actions={
          <Button asChild>
            <Link href="/bills/new">
              <Plus /> New bill
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="mb-6">
          <CardsSkeleton count={3} />
        </div>
      ) : (
        <div className="mb-6 space-y-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Total payable"
              icon={Wallet}
              value={<ConvertedMoney sum={summary.total} currency={money.display} rate={money.rate} />}
              description={`${summary.count} unpaid ${summary.count === 1 ? "bill" : "bills"}`}
            />
            <StatCard
              label="Overdue"
              icon={AlertTriangle}
              value={<ConvertedMoney sum={summary.overdue} currency={money.display} rate={money.rate} className={cn(summary.overdueCount > 0 && "text-error-text")} />}
              description={summary.overdueCount > 0 ? `${summary.overdueCount} ${summary.overdueCount === 1 ? "bill is" : "bills are"} past due` : "Nothing overdue"}
            />
            <StatCard
              label="Due in next 14 days"
              icon={CalendarClock}
              value={<ConvertedMoney sum={summary.dueSoon} currency={money.display} rate={money.rate} />}
              description={`${summary.dueSoonCount} ${summary.dueSoonCount === 1 ? "bill" : "bills"} coming due`}
            />
          </div>
          <ConversionNote
            converted={summary.total.converted}
            excludedForeign={summary.total.excludedForeign}
            rate={money.rate}
            currency={money.display}
          />
        </div>
      )}

      <div className="mb-4 overflow-x-auto">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList aria-label="Filter bills by status">
            <TabsTrigger value="all">
              All <span className="text-muted-foreground tabular-nums">{rows.length}</span>
            </TabsTrigger>
            {BILL_STATUS_ORDER.map((s) => (
              <TabsTrigger key={s} value={s}>
                {BILL_STATUS_LABEL[s]} <span className="text-muted-foreground tabular-nums">{counts.get(s) ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search supplier, number…"
          searchFn={(r, q) => r.supplier.toLowerCase().includes(q) || r.number.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)}
          facets={[...(showBranch ? [{ columnId: "branch", label: "Branches", options: branchOptions }] : []), { columnId: "category", label: "Categories", options: categoryOptions }]}
          initialHidden={showBranch ? [] : ["branch"]}
          initialSorting={[{ id: "dueDate", desc: false }]}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/bills/${r.id}`)}
          empty={
            rows.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No bills yet"
                description="Record supplier bills to track what you owe and when it's due."
                action={
                  <Button asChild size="sm">
                    <Link href="/bills/new">
                      <Plus /> New bill
                    </Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={FileText} title={tab === "all" ? "No matching bills" : `No ${BILL_STATUS_LABEL[tab as BillStatus].toLowerCase()} bills`} description="Try another status or clear your search and filters." />
            )
          }
        />
      </Card>
    </>
  );
}
