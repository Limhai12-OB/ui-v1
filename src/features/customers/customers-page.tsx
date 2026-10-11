"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowRight, Plus, Store, Users } from "lucide-react";
import type { Customer } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatDate, daysBetween, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyAmounts } from "@/features/sales-shared/components";
import { amountSortKey, customerStats, emptyStats, type CustomerStats } from "./customer-stats";

type Row = Customer & { stats: CustomerStats; branchLabel: string };

export function CustomersPage() {
  const router = useRouter();
  const customers = useAppStore((s) => s.customers);
  const invoices = useAppStore((s) => s.invoices);
  const { inScope, isOwner, branches } = useScope();
  const { branchName } = useLookups();
  const loading = useInitialLoad();
  const [tab, setTab] = useState<"wholesale" | "walk_in">("wholesale");

  const stats = useMemo(() => customerStats(invoices.filter((i) => inScope(i.branchId))), [invoices, inScope]);
  const scoped = useMemo<Row[]>(
    () => customers.filter((c) => inScope(c.branchId)).map((c) => ({ ...c, stats: stats.get(c.id) ?? emptyStats(), branchLabel: branchName(c.branchId) })),
    [customers, inScope, stats, branchName],
  );
  const counts = { wholesale: scoped.filter((c) => c.type === "wholesale").length, walk_in: scoped.filter((c) => c.type === "walk_in").length };
  const data = scoped.filter((c) => c.type === tab);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(() => {
    const cols: ColumnDef<Row, unknown>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => <SortHeader column={column} title="Customer" />,
        meta: { label: "Customer" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/customers/${row.original.id}`} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => e.stopPropagation()}>
              {row.original.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{row.original.contactName ?? row.original.email ?? "—"}</p>
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{getValue() as string}</span> },
      { id: "branch", accessorFn: (c) => c.branchId, header: "Branch", meta: { label: "Branch" }, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.branchLabel}</span> },
    ];
    if (tab === "wholesale") {
      cols.push(
        {
          accessorKey: "paymentTermsDays",
          header: ({ column }) => <SortHeader column={column} title="Terms" align="right" />,
          meta: { align: "right", label: "Payment terms" },
          cell: ({ getValue }) => `${getValue() as number} days`,
        },
        {
          id: "open",
          accessorFn: (c) => c.stats.openCount,
          header: ({ column }) => <SortHeader column={column} title="Open invoices" align="right" />,
          meta: { align: "right", label: "Open invoices" },
        },
        {
          id: "outstanding",
          accessorFn: (c) => amountSortKey(c.stats.outstanding),
          header: ({ column }) => <SortHeader column={column} title="Outstanding" align="right" />,
          meta: { align: "right", label: "Outstanding" },
          cell: ({ row }) => <CurrencyAmounts values={row.original.stats.outstanding} className="justify-end font-medium" />,
        },
        {
          id: "overdue",
          accessorFn: (c) => c.stats.overdueCount,
          header: ({ column }) => <SortHeader column={column} title="Overdue" />,
          meta: { label: "Overdue" },
          cell: ({ row }) => {
            const s = row.original.stats;
            if (!s.overdueCount) return <span className="text-xs text-muted-foreground">None</span>;
            return (
              <Badge variant="error" className="gap-1">
                <AlertTriangle aria-hidden />
                {s.overdueCount} overdue{s.oldestOverdueDue ? ` · ${daysBetween(s.oldestOverdueDue, today())}d` : ""}
              </Badge>
            );
          },
        },
      );
    }
    cols.push({
      id: "last",
      accessorFn: (c) => c.stats.lastInvoiceDate ?? "",
      header: ({ column }) => <SortHeader column={column} title="Last invoice" />,
      meta: { label: "Last invoice" },
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{row.original.stats.lastInvoiceDate ? formatDate(row.original.stats.lastInvoiceDate) : "—"}</span>,
    });
    return cols;
  }, [tab]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Wholesale accounts you invoice on terms, and walk-in regulars you know by name."
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus /> New customer
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="wholesale">Wholesale customers ({counts.wholesale})</TabsTrigger>
          <TabsTrigger value="walk_in">Walk-in customers ({counts.walk_in})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "walk_in" && (
        <Card className="mb-4 flex-row flex-wrap items-center gap-3 p-4">
          <span className="flex size-9 items-center justify-center rounded-lg bg-info-light text-info-text">
            <Store className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Regulars only</p>
            <p className="text-muted-foreground">This list holds walk-in customers you track by name (loyalty cards, frequent buyers). Anonymous counter sales are recorded as walk-in sales.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/walk-in-sales">
              Walk-in sales <ArrowRight />
            </Link>
          </Button>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          key={tab}
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search name, contact, phone…"
          searchFn={(c, q) => [c.name, c.contactName, c.phone, c.email, c.telegram].some((v) => v?.toLowerCase().includes(q)) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))}
          facets={isOwner && branches.length > 1 ? [{ columnId: "branch", label: "Branches", options: branches.map((b) => ({ label: b.name, value: b.id })) }] : []}
          getRowId={(c) => c.id}
          onRowClick={(c) => router.push(`/customers/${c.id}`)}
          initialSorting={[{ id: "name", desc: false }]}
          empty={
            <EmptyState
              icon={Users}
              title={tab === "wholesale" ? "No wholesale customers yet" : "No walk-in regulars yet"}
              description={tab === "wholesale" ? "Add the restaurants, guesthouses and shops you supply on invoice." : "Add regulars to track their purchases by name."}
              action={
                <Button size="sm" asChild>
                  <Link href="/customers/new">
                    <Plus /> New customer
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
    </>
  );
}
