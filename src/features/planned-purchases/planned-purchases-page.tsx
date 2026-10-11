"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Plus } from "lucide-react";
import type { PlannedPurchase, PlannedPurchaseStatus } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { plannedPurchaseStatus, plannedPurchaseTotal } from "@/lib/domain";
import { formatDate, relativeDays } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Row = PlannedPurchase & { derived: PlannedPurchaseStatus; customerLabel: string; total: number };
type Tab = "all" | PlannedPurchaseStatus;
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
  { id: "converted", label: "Converted" },
];

export function PlannedPurchasesPage() {
  const router = useRouter();
  const planned = useAppStore((s) => s.plannedPurchases);
  const invoices = useAppStore((s) => s.invoices);
  const { inScope, isOwner, branches } = useScope();
  const { customerName, branchName } = useLookups();
  const loading = useInitialLoad();
  const [tab, setTab] = useState<Tab>("all");

  const rows = useMemo<Row[]>(
    () => planned.filter((p) => inScope(p.branchId)).map((p) => ({ ...p, derived: plannedPurchaseStatus(p), customerLabel: customerName(p.customerId), total: plannedPurchaseTotal(p) })),
    [planned, inScope, customerName],
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    for (const r of rows) m[r.derived] = (m[r.derived] ?? 0) + 1;
    return m;
  }, [rows]);
  const data = tab === "all" ? rows : rows.filter((r) => r.derived === tab);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <SortHeader column={column} title="Number" />,
        meta: { label: "Number" },
        cell: ({ row }) => (
          <Link href={`/planned-purchases/${row.original.id}`} className="font-medium tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.number}
          </Link>
        ),
      },
      { accessorKey: "customerLabel", header: ({ column }) => <SortHeader column={column} title="Customer" />, meta: { label: "Customer" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { id: "branch", accessorFn: (r) => r.branchId, header: "Branch", meta: { label: "Branch" }, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{branchName(row.original.branchId)}</span> },
      { accessorKey: "createdDate", header: ({ column }) => <SortHeader column={column} title="Created" />, meta: { label: "Created" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue() as string)}</span> },
      {
        accessorKey: "validUntil",
        header: ({ column }) => <SortHeader column={column} title="Valid until" />,
        meta: { label: "Valid until" },
        cell: ({ row }) => {
          const r = row.original;
          const live = r.derived === "sent" || r.derived === "draft";
          return (
            <div className="whitespace-nowrap">
              <p className="tabular-nums">{formatDate(r.validUntil)}</p>
              {(live || r.derived === "expired") && <p className="text-xs text-muted-foreground">{r.derived === "expired" ? `Expired ${relativeDays(r.validUntil)}` : `Expires ${relativeDays(r.validUntil)}`}</p>}
            </div>
          );
        },
      },
      { accessorKey: "expectedDeliveryDate", header: "Delivery", meta: { label: "Expected delivery" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDate(getValue() as string | undefined)}</span> },
      { accessorKey: "total", header: ({ column }) => <SortHeader column={column} title="Estimated total" align="right" />, meta: { align: "right", label: "Estimated total" }, cell: ({ row }) => <Money amount={row.original.total} currency={row.original.currency} className="font-medium" /> },
      {
        accessorKey: "derived",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => {
          const inv = row.original.convertedInvoiceId ? invoices.find((i) => i.id === row.original.convertedInvoiceId) : undefined;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={row.original.derived} />
              {inv && (
                <Link href={`/invoices/${inv.id}`} className="text-xs tabular-nums text-muted-foreground hover:text-foreground hover:underline" onClick={(e) => e.stopPropagation()}>
                  → {inv.number}
                </Link>
              )}
            </div>
          );
        },
      },
    ],
    [branchName, invoices],
  );

  return (
    <>
      <PageHeader
        title="Planned purchases"
        description="Estimates sent to wholesale customers before delivery. Accepted estimates convert into invoices."
        actions={
          <Button asChild>
            <Link href="/planned-purchases/new">
              <Plus /> New planned purchase
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
        <div className="overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="tabular-nums">
                {t.label} ({counts[t.id] ?? 0})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search number or customer…"
          searchFn={(r, q) => r.number.toLowerCase().includes(q) || r.customerLabel.toLowerCase().includes(q)}
          facets={isOwner && branches.length > 1 ? [{ columnId: "branch", label: "Branches", options: branches.map((b) => ({ label: b.name, value: b.id })) }] : []}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/planned-purchases/${r.id}`)}
          initialSorting={[{ id: "createdDate", desc: true }]}
          empty={
            <EmptyState
              icon={ClipboardList}
              title={tab === "all" ? "No planned purchases yet" : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} planned purchases`}
              description="Send customers an estimate before delivery, then convert it to an invoice when they accept."
              action={
                tab === "all" && (
                  <Button size="sm" asChild>
                    <Link href="/planned-purchases/new">
                      <Plus /> New planned purchase
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
