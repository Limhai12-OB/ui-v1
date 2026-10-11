"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Boxes, Columns3, Package, PackageX, Plus, Upload, Wallet } from "lucide-react";
import type { Item } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatNumber } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money, ConvertedMoney, ConversionNote } from "@/components/shared/money";
import { CardsSkeleton, EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { MarginValue, marginPercent, stockIn, stockValue, useItemCategories, worstLevel } from "./inventory-shared";

export function ItemsPage() {
  const router = useRouter();
  const items = useAppStore((s) => s.items);
  const { scope, isOwner, branch, branches, money } = useScope();
  const { categoryName } = useLookups();
  const canManage = useCan("items.manage");
  const itemCategories = useItemCategories();
  const loading = useInitialLoad();
  const [lowOnly, setLowOnly] = useState(false);
  const [perBranch, setPerBranch] = useState(false);

  const branchIds = scope.branchIds;
  const multiBranch = isOwner && !branch && branchIds.length > 1;
  const showPerBranch = multiBranch && perBranch;
  const scopeBranches = branches.filter((b) => branchIds.includes(b.id));

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status === "active");
    let low = 0;
    let out = 0;
    for (const i of active) {
      for (const b of branchIds) {
        const q = i.stock[b] ?? 0;
        if (q <= 0) out++;
        else if (q <= i.reorderLevel) low++;
      }
    }
    return { active: active.length, low, out, value: stockValue(items, branchIds, money.display, money.rate) };
  }, [items, branchIds, money.display, money.rate]);

  const data = useMemo(() => (lowOnly ? items.filter((i) => i.status === "active" && worstLevel(i, branchIds).level !== "ok") : items), [items, lowOnly, branchIds]);

  const columns = useMemo<ColumnDef<Item, unknown>[]>(() => {
    const cols: ColumnDef<Item, unknown>[] = [
      {
        accessorKey: "sku",
        header: ({ column }) => <SortHeader column={column} title="SKU" />,
        meta: { label: "SKU" },
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
      },
      {
        accessorKey: "name",
        header: ({ column }) => <SortHeader column={column} title="Item" />,
        meta: { label: "Item" },
        enableHiding: false,
        cell: ({ row }) => (
          <div className="min-w-48">
            <Link href={`/items/${row.original.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.name}
            </Link>
            {row.original.nameKm && (
              <p lang="km" className="text-xs text-muted-foreground">
                {row.original.nameKm}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "category",
        accessorFn: (i) => i.categoryId,
        header: "Category",
        cell: ({ row }) => <span className="whitespace-nowrap">{categoryName(row.original.categoryId)}</span>,
      },
      { accessorKey: "unit", header: "Unit" },
      {
        accessorKey: "sellingPrice",
        header: ({ column }) => <SortHeader column={column} title="Price" align="right" />,
        meta: { align: "right", label: "Selling price" },
        cell: ({ row }) => <Money amount={row.original.sellingPrice} currency={row.original.currency} />,
      },
      {
        accessorKey: "costPrice",
        header: ({ column }) => <SortHeader column={column} title="Cost" align="right" />,
        meta: { align: "right", label: "Cost price" },
        cell: ({ row }) => <Money amount={row.original.costPrice} currency={row.original.currency} className="text-muted-foreground" />,
      },
      {
        id: "margin",
        accessorFn: (i) => marginPercent(i.sellingPrice, i.costPrice) ?? -Infinity,
        header: ({ column }) => <SortHeader column={column} title="Margin" align="right" />,
        meta: { align: "right", label: "Margin %" },
        cell: ({ row }) => <MarginValue selling={row.original.sellingPrice} cost={row.original.costPrice} />,
      },
    ];
    if (showPerBranch) {
      for (const b of scopeBranches) {
        cols.push({
          id: `stock_${b.id}`,
          accessorFn: (i) => i.stock[b.id] ?? 0,
          header: ({ column }) => <SortHeader column={column} title={b.code} align="right" />,
          meta: { align: "right", label: `Stock – ${b.name}` },
          cell: ({ row }) => {
            const q = row.original.stock[b.id] ?? 0;
            const lvl = q <= 0 ? "out" : q <= row.original.reorderLevel ? "low" : "ok";
            return (
              <span className={lvl === "ok" ? "" : lvl === "out" ? "inline-flex items-center gap-1 font-medium text-error-text" : "inline-flex items-center gap-1 font-medium text-warning-text"} title={`${b.name}: ${q} ${row.original.unit}${lvl !== "ok" ? ` (${lvl === "out" ? "out of stock" : "low"})` : ""}`}>
                {lvl === "out" ? <PackageX className="size-3" aria-hidden /> : lvl === "low" ? <AlertTriangle className="size-3" aria-hidden /> : null}
                {formatNumber(q)}
                {lvl !== "ok" && <span className="sr-only"> ({lvl === "out" ? "out of stock" : "low stock"})</span>}
              </span>
            );
          },
        });
      }
    }
    cols.push(
      {
        id: "stock",
        accessorFn: (i) => stockIn(i, branchIds),
        header: ({ column }) => <SortHeader column={column} title={showPerBranch ? "Total" : branch ? "Stock" : "Total stock"} align="right" />,
        meta: { align: "right", label: "Stock" },
        cell: ({ row }) => (
          <span className="font-medium">
            {formatNumber(stockIn(row.original, branchIds))} <span className="text-xs font-normal text-muted-foreground">{row.original.unit}</span>
          </span>
        ),
      },
      {
        id: "stockStatus",
        accessorFn: (i) => worstLevel(i, branchIds).level,
        header: "Stock status",
        cell: ({ row }) => {
          const { level, count } = worstLevel(row.original, branchIds);
          return (
            <div className="flex flex-col items-start gap-0.5">
              <StatusBadge status={level} />
              {branchIds.length > 1 && level !== "ok" && (
                <span className="text-[11px] text-muted-foreground">
                  in {count} of {branchIds.length} branches
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Item status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
      },
    );
    return cols;
  }, [branchIds, branch, showPerBranch, scopeBranches, categoryName]);

  const scopeLabel = branch ? branch.name : isOwner ? "all branches" : "your branch";

  return (
    <>
      <PageHeader
        title="Items"
        description={`Item master data is shared across the business. Stock shown for ${scopeLabel}.`}
        actions={
          canManage && (
            <>
              <Button variant="outline" asChild>
                <Link href="/items/import">
                  <Upload /> Bulk import
                </Link>
              </Button>
              <Button asChild>
                <Link href="/items/new">
                  <Plus /> New item
                </Link>
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <CardsSkeleton />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active SKUs" value={formatNumber(stats.active)} icon={Package} description={`${items.length - stats.active} inactive`} />
          <StatCard
            label="Low stock"
            value={formatNumber(stats.low)}
            icon={AlertTriangle}
            description={branchIds.length > 1 ? "Item–branch pairs at or below reorder level" : "Items at or below reorder level"}
          />
          <StatCard label="Out of stock" value={formatNumber(stats.out)} icon={PackageX} description={branchIds.length > 1 ? "Item–branch pairs with zero on hand" : "Items with zero on hand"} />
          <StatCard
            label="Stock value at cost"
            value={<ConvertedMoney sum={stats.value} currency={money.display} rate={money.rate} />}
            icon={Wallet}
            description={`On hand in ${scopeLabel}`}
          />
        </div>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          key={showPerBranch ? "pb" : "single"}
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search SKU, name or barcode…"
          searchFn={(i, q) => i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.nameKm ?? "").includes(q) || (i.barcode ?? "").includes(q)}
          getRowId={(i) => i.id}
          onRowClick={(i) => router.push(`/items/${i.id}`)}
          initialSorting={[{ id: "sku", desc: false }]}
          initialHidden={["unit"]}
          pageSize={20}
          facets={[
            { columnId: "category", label: "Categories", options: itemCategories.map((c) => ({ label: c.name, value: c.id })) },
            {
              columnId: "stockStatus",
              label: "Stock statuses",
              options: [
                { label: "In stock", value: "ok" },
                { label: "Low stock", value: "low" },
                { label: "Out of stock", value: "out" },
              ],
            },
            {
              columnId: "status",
              label: "Item statuses",
              options: [
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ],
            },
          ]}
          toolbar={
            <>
              <Toggle variant="outline" pressed={lowOnly} onPressedChange={setLowOnly} className="h-9 data-[state=on]:border-primary/50 data-[state=on]:bg-primary-light/40 data-[state=on]:text-primary">
                <AlertTriangle /> Needs reorder
              </Toggle>
              {multiBranch && (
                <Toggle variant="outline" pressed={perBranch} onPressedChange={setPerBranch} className="h-9 data-[state=on]:border-primary/50 data-[state=on]:bg-primary-light/40 data-[state=on]:text-primary">
                  <Columns3 /> Per-branch stock
                </Toggle>
              )}
            </>
          }
          empty={
            <EmptyState
              icon={Boxes}
              title={lowOnly ? "Nothing needs reordering" : "No items yet"}
              description={lowOnly ? "Every active item is above its reorder level in this scope." : "Add your first item or import a catalog to start tracking stock."}
              action={
                !lowOnly && canManage ? (
                  <Button asChild size="sm">
                    <Link href="/items/new">
                      <Plus /> New item
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Card>
      <ConversionNote converted={stats.value.converted} excludedForeign={stats.value.excludedForeign} rate={money.rate} currency={money.display} className="mt-3" />
    </>
  );
}
