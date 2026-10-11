"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, ClipboardList, Plus } from "lucide-react";
import type { StockAdjustment } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatNumber } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ADJUSTMENT_META, AdjustmentTypeBadge, SignedQty } from "./inventory-shared";
import { DatePresetSelect, presetRange, type DatePreset } from "@/features/sales/sales-shared";

export function StockAdjustmentsPage() {
  const adjustments = useAppStore((s) => s.stockAdjustments);
  const { inScope, branches, scope } = useScope();
  const { item, branchName } = useLookups();
  const canManage = useCan("items.manage");
  const loading = useInitialLoad();
  const [preset, setPreset] = useState<DatePreset>("all");

  const data = useMemo(() => {
    const { start, end } = presetRange(preset);
    return adjustments.filter((a) => inScope(a.branchId) && a.date >= start && a.date <= end);
  }, [adjustments, inScope, preset]);

  const columns = useMemo<ColumnDef<StockAdjustment, unknown>[]>(
    () => [
      { accessorKey: "number", header: ({ column }) => <SortHeader column={column} title="Number" />, meta: { label: "Number" }, cell: ({ getValue }) => <span className="font-mono text-xs whitespace-nowrap">{getValue() as string}</span> },
      {
        id: "date",
        accessorFn: (a) => `${a.date}|${a.createdAt}`,
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        meta: { label: "Date" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
      },
      {
        id: "item",
        accessorFn: (a) => item(a.itemId)?.name ?? "",
        header: "Item",
        meta: { label: "Item" },
        cell: ({ row }) => {
          const it = item(row.original.itemId);
          return it ? (
            <Link href={`/items/${it.id}`} className="block min-w-44 hover:underline">
              <span className="font-medium">{it.name}</span>
              <span className="block font-mono text-xs text-muted-foreground">{it.sku}</span>
            </Link>
          ) : (
            "—"
          );
        },
      },
      { id: "branch", accessorFn: (a) => a.branchId, header: "Branch", cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span> },
      { id: "type", accessorFn: (a) => a.type, header: "Type", cell: ({ row }) => <AdjustmentTypeBadge type={row.original.type} /> },
      {
        id: "qty",
        header: "Previous → new",
        meta: { align: "right", label: "Previous → new" },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
            <span className="text-muted-foreground">{formatNumber(row.original.previousQuantity)}</span>
            <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
            <span className="font-medium">{formatNumber(row.original.newQuantity)}</span>
          </span>
        ),
      },
      {
        id: "change",
        accessorFn: (a) => a.newQuantity - a.previousQuantity,
        header: ({ column }) => <SortHeader column={column} title="Change" align="right" />,
        meta: { align: "right", label: "Change" },
        cell: ({ getValue }) => <SignedQty value={getValue() as number} />,
      },
      {
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <div className="max-w-64 min-w-40">
            <p>{row.original.reason}</p>
            {row.original.note && <p className="truncate text-xs text-muted-foreground" title={row.original.note}>{row.original.note}</p>}
          </div>
        ),
      },
      { accessorKey: "createdBy", header: "By", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
    ],
    [item, branchName],
  );

  const scopeBranches = branches.filter((b) => scope.branchIds.includes(b.id));

  return (
    <>
      <PageHeader
        title="Stock adjustments"
        description="Manual changes to on-hand stock: deliveries, returns, damage and stock-count corrections. Each adjustment creates a stock movement."
        actions={
          canManage && (
            <Button asChild>
              <Link href="/stock-adjustments/new">
                <Plus /> New adjustment
              </Link>
            </Button>
          )
        }
      />
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search item, number or reason…"
          searchFn={(a, q) => {
            const it = item(a.itemId);
            return a.number.toLowerCase().includes(q) || a.reason.toLowerCase().includes(q) || (a.note ?? "").toLowerCase().includes(q) || (it?.name.toLowerCase().includes(q) ?? false) || (it?.sku.toLowerCase().includes(q) ?? false);
          }}
          getRowId={(a) => a.id}
          initialSorting={[{ id: "date", desc: true }]}
          pageSize={20}
          facets={[
            { columnId: "type", label: "Types", options: Object.entries(ADJUSTMENT_META).map(([value, m]) => ({ value, label: m.short })) },
            ...(scopeBranches.length > 1 ? [{ columnId: "branch", label: "Branches", options: scopeBranches.map((b) => ({ value: b.id, label: b.name })) }] : []),
          ]}
          toolbar={<DatePresetSelect value={preset} onChange={setPreset} />}
          empty={
            <EmptyState
              icon={ClipboardList}
              title={preset === "all" ? "No stock adjustments yet" : "No adjustments in this period"}
              description="Record deliveries, damaged goods or stock-count corrections to keep on-hand quantities accurate."
              action={
                canManage ? (
                  <Button asChild size="sm">
                    <Link href="/stock-adjustments/new">
                      <Plus /> New adjustment
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>
    </>
  );
}
