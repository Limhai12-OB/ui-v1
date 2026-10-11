"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, History, PackageSearch, Pencil, Power, PowerOff, ShoppingCart, SlidersHorizontal } from "lucide-react";
import type { StockMovement } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { itemService } from "@/lib/api";
import { formatNumber } from "@/lib/currency";
import { stockLevel } from "@/lib/domain";
import { addDaysISO, formatDate, formatDateTime, today } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailList } from "@/components/shared/detail-list";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { AXIS_PROPS, ChartTooltip, GRID_PROPS, SERIES } from "@/components/charts/chart-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MOVEMENT_META, MarginValue, MovementTypeBadge, SignedQty, stockIn } from "./inventory-shared";

interface SaleLineRow {
  id: string;
  saleId: string;
  number: string;
  date: string;
  branchId: string;
  channel: string;
  quantity: number;
  unitPrice: number;
  currency: "USD" | "KHR";
}

export function ItemDetailPage({ id }: { id: string }) {
  const item = useAppStore((s) => s.items.find((i) => i.id === id));
  const movements = useAppStore((s) => s.stockMovements);
  const sales = useAppStore((s) => s.sales);
  const adjustments = useAppStore((s) => s.stockAdjustments);
  const { scope, branches, inScope, isOwner } = useScope();
  const { branchName, categoryName, category } = useLookups();
  const canManage = useCan("items.manage");
  const [confirmStatus, setConfirmStatus] = useState(false);
  const toggle = useAction((next: "active" | "inactive") => itemService.update(id, { status: next }), {
    success: () => (item?.status === "active" ? "Item deactivated" : "Item activated"),
  });

  const itemMovements = useMemo(
    () => movements.filter((m) => m.itemId === id && inScope(m.branchId)).sort((a, b) => (b.date === a.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [movements, id, inScope],
  );
  const lines = useMemo<SaleLineRow[]>(() => {
    const out: SaleLineRow[] = [];
    for (const s of sales) {
      if (!inScope(s.branchId)) continue;
      for (const l of s.lines) if (l.itemId === id) out.push({ id: l.id, saleId: s.id, number: s.number, date: s.date, branchId: s.branchId, channel: s.channel, quantity: l.quantity, unitPrice: l.unitPrice, currency: s.currency });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, id, inScope]);

  const daily = useMemo(() => {
    const end = today();
    const start = addDaysISO(end, -29);
    const map = new Map<string, number>();
    for (let i = 0; i < 30; i++) map.set(addDaysISO(start, i), 0);
    for (const l of lines) if (map.has(l.date)) map.set(l.date, map.get(l.date)! + l.quantity);
    return [...map.entries()].map(([date, units]) => ({ date, label: formatDate(date, "d MMM"), units }));
  }, [lines]);
  const units30 = daily.reduce((s, d) => s + d.units, 0);

  const adjByNumber = useMemo(() => new Map(adjustments.flatMap((a) => [[a.number, a] as const, [a.id, a] as const])), [adjustments]);
  const saleByNumber = useMemo(() => new Map(sales.map((s) => [s.number, s])), [sales]);

  const movementColumns = useMemo<ColumnDef<StockMovement, unknown>[]>(
    () => [
      { accessorKey: "date", header: ({ column }) => <SortHeader column={column} title="Date" />, meta: { label: "Date" }, cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
      { id: "branch", accessorFn: (m) => m.branchId, header: "Branch", cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span> },
      { id: "type", accessorFn: (m) => m.type, header: "Type", cell: ({ row }) => <MovementTypeBadge type={row.original.type} /> },
      { accessorKey: "quantityChange", header: ({ column }) => <SortHeader column={column} title="Change" align="right" />, meta: { align: "right", label: "Change" }, cell: ({ getValue }) => <SignedQty value={getValue() as number} /> },
      { accessorKey: "resultingQuantity", header: "Resulting qty", meta: { align: "right" }, cell: ({ getValue }) => formatNumber(getValue() as number) },
      { accessorKey: "reason", header: "Reason", cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || "—"}</span> },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => {
          const ref = row.original.reference;
          if (!ref) return "—";
          const sale = saleByNumber.get(ref);
          if (sale?.channel === "walk_in")
            return (
              <Link href={`/walk-in-sales/${sale.id}`} className="font-mono text-xs underline underline-offset-2">
                {ref}
              </Link>
            );
          const adj = adjByNumber.get(ref);
          if (adj)
            return (
              <Link href="/stock-adjustments" className="font-mono text-xs underline underline-offset-2">
                {adj.number}
              </Link>
            );
          return <span className="text-xs text-muted-foreground">{ref.startsWith("adj_") ? "Supplier delivery" : <span className="font-mono">{ref}</span>}</span>;
        },
      },
      { accessorKey: "createdBy", header: "By", cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
    ],
    [branchName, saleByNumber, adjByNumber],
  );

  const saleColumns = useMemo<ColumnDef<SaleLineRow, unknown>[]>(
    () => [
      { accessorKey: "date", header: ({ column }) => <SortHeader column={column} title="Date" />, meta: { label: "Date" }, cell: ({ row }) => formatDate(row.original.date) },
      {
        accessorKey: "number",
        header: "Sale",
        cell: ({ row }) =>
          row.original.channel === "walk_in" ? (
            <Link href={`/walk-in-sales/${row.original.saleId}`} className="font-mono text-xs hover:underline">
              {row.original.number}
            </Link>
          ) : (
            <span className="font-mono text-xs">{row.original.number}</span>
          ),
      },
      { id: "branch", accessorFn: (r) => r.branchId, header: "Branch", cell: ({ row }) => branchName(row.original.branchId) },
      { accessorKey: "quantity", header: ({ column }) => <SortHeader column={column} title="Qty" align="right" />, meta: { align: "right", label: "Qty" } },
      { accessorKey: "unitPrice", header: "Unit price", meta: { align: "right" }, cell: ({ row }) => <Money amount={row.original.unitPrice} currency={row.original.currency} /> },
      { id: "total", accessorFn: (r) => r.quantity * r.unitPrice, header: ({ column }) => <SortHeader column={column} title="Line total" align="right" />, meta: { align: "right", label: "Line total" }, cell: ({ row }) => <Money amount={row.original.quantity * row.original.unitPrice} currency={row.original.currency} className="font-medium" /> },
    ],
    [branchName],
  );

  if (!item) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Item not found"
        description="It may have been removed or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/items">Back to items</Link>
          </Button>
        }
      />
    );
  }

  const scopeBranches = branches.filter((b) => scope.branchIds.includes(b.id));
  const lowBranches = item.status === "active" ? scopeBranches.filter((b) => (item.stock[b.id] ?? 0) <= item.reorderLevel) : [];
  const total = stockIn(item, scope.branchIds);
  const branchFacetOptions = scopeBranches.map((b) => ({ label: b.name, value: b.id }));
  const nextStatus = item.status === "active" ? "inactive" : "active";

  return (
    <>
      <PageHeader
        backHref="/items"
        backLabel="Items"
        title={item.name}
        meta={
          <>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{item.sku}</span>
            <StatusBadge status={item.status} />
          </>
        }
        description={
          <>
            {item.nameKm && <span lang="km">{item.nameKm} · </span>}
            {categoryName(item.categoryId)} · sold per {item.unit}
          </>
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setConfirmStatus(true)}>
                {item.status === "active" ? <PowerOff /> : <Power />}
                {item.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/items/${item.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/stock-adjustments/new?item=${item.id}`}>
                  <SlidersHorizontal /> Adjust stock
                </Link>
              </Button>
            </>
          )
        }
      />

      {lowBranches.length > 0 && (
        <div role="status" className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {lowBranches.some((b) => (item.stock[b.id] ?? 0) <= 0) ? "Out of stock or low" : "Low stock"} in {lowBranches.map((b) => b.name).join(", ")}
            </p>
            <p className="text-xs">
              On hand is at or below the reorder level of {item.reorderLevel} {item.unit}. Record a delivery with a stock increase once new stock arrives.
            </p>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" asChild className="border-warning/40 bg-card">
              <Link href={`/stock-adjustments/new?item=${item.id}`}>Record delivery</Link>
            </Button>
          )}
        </div>
      )}

      {item.status === "inactive" && (
        <div role="note" className="mb-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This item is inactive. It&rsquo;s hidden from the walk-in sale screen and doesn&rsquo;t raise low-stock alerts.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              columns={2}
              items={[
                { label: "Selling price", value: <Money amount={item.sellingPrice} currency={item.currency} className="text-base font-semibold" /> },
                { label: "Cost price", value: <Money amount={item.costPrice} currency={item.currency} className="text-base" /> },
                { label: "Margin", value: <MarginValue selling={item.sellingPrice} cost={item.costPrice} className="text-base font-semibold" /> },
                { label: "Profit per unit", value: <Money amount={item.sellingPrice - item.costPrice} currency={item.currency} /> },
                { label: "Category", value: category(item.categoryId)?.name ?? "—" },
                { label: "Barcode", value: item.barcode ? <span className="font-mono">{item.barcode}</span> : "—" },
                { label: "Reorder level", value: <span className="tabular-nums">{formatNumber(item.reorderLevel)} {item.unit}</span> },
                { label: "Created", value: formatDate(item.createdAt.slice(0, 10)) },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b py-4">
            <CardTitle>Stock by branch</CardTitle>
            <CardDescription>
              {formatNumber(total)} {item.unit} on hand{scopeBranches.length > 1 ? ` across ${scopeBranches.length} branches` : ` at ${scopeBranches[0]?.name ?? "your branch"}`}
              {!isOwner && " · other branches are managed by their own managers"}
            </CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/40 pl-4 text-xs">Branch</TableHead>
                  <TableHead className="bg-muted/40 text-right text-xs">On hand</TableHead>
                  <TableHead className="bg-muted/40 text-right text-xs">Reorder level</TableHead>
                  <TableHead className="bg-muted/40 text-xs">Status</TableHead>
                  <TableHead className="bg-muted/40 pr-4 text-right text-xs">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopeBranches.map((b) => {
                  const q = item.stock[b.id] ?? 0;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="pl-4 font-medium">{b.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(q)} <span className="text-xs text-muted-foreground">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(item.reorderLevel)}</TableCell>
                      <TableCell>
                        <StatusBadge status={stockLevel(q, item.reorderLevel)} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {canManage && (
                          <Button variant="ghost" size="xs" asChild>
                            <Link href={`/stock-adjustments/new?item=${item.id}&branch=${b.id}`} aria-label={`Adjust stock at ${b.name}`}>
                              Adjust
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Units sold · last 30 days</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground tabular-nums">{formatNumber(units30)}</span> {item.unit} sold {formatDate(addDaysISO(today(), -29), "d MMM")} – {formatDate(today(), "d MMM")}
            {scopeBranches.length > 1 ? " across all branches in view" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {units30 === 0 ? (
            <EmptyState compact icon={ShoppingCart} title="No sales in the last 30 days" />
          ) : (
            <div className="h-48" role="img" aria-label={`Bar chart of daily units sold over the last 30 days, total ${units30}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} interval={4} minTickGap={8} />
                  <YAxis {...AXIS_PROPS} allowDecimals={false} width={40} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip valueFormatter={(v) => `${formatNumber(v)} ${item.unit}`} />} />
                  <Bar dataKey="units" name="Units sold" fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="mt-8">
        <SectionHeader title="Movement history" description="Every change to on-hand quantity, newest first." />
        <Card className="gap-0 py-0">
          <DataTable
            columns={movementColumns}
            data={itemMovements}
            searchPlaceholder="Search reason or reference…"
            searchFn={(m, q) => (m.reason ?? "").toLowerCase().includes(q) || (m.reference ?? "").toLowerCase().includes(q) || m.createdBy.toLowerCase().includes(q)}
            getRowId={(m) => m.id}
            facets={[
              ...(branchFacetOptions.length > 1 ? [{ columnId: "branch", label: "Branches", options: branchFacetOptions }] : []),
              { columnId: "type", label: "Types", options: Object.entries(MOVEMENT_META).map(([value, m]) => ({ value, label: m.label })) },
            ]}
            empty={<EmptyState compact icon={History} title="No stock movements yet" />}
          />
        </Card>
      </section>

      <section className="mt-8">
        <SectionHeader title="Sales history" description="Sale lines that included this item." />
        <Card className="gap-0 py-0">
          <DataTable
            columns={saleColumns}
            data={lines}
            bare={lines.length === 0}
            searchPlaceholder="Search sale number…"
            searchFn={(r, q) => r.number.toLowerCase().includes(q)}
            getRowId={(r) => r.id}
            facets={branchFacetOptions.length > 1 ? [{ columnId: "branch", label: "Branches", options: branchFacetOptions }] : []}
            empty={<EmptyState compact icon={ShoppingCart} title="This item hasn't been sold yet" />}
          />
        </Card>
      </section>

      <p className="mt-6 text-xs text-muted-foreground">Last movement: {itemMovements[0] ? formatDateTime(itemMovements[0].createdAt) : "—"}</p>

      <ConfirmDialog
        open={confirmStatus}
        onOpenChange={setConfirmStatus}
        title={item.status === "active" ? `Deactivate ${item.name}?` : `Activate ${item.name}?`}
        description={
          item.status === "active"
            ? "It will be hidden from the walk-in sale screen and won't raise low-stock alerts. Stock and history are kept, and you can activate it again at any time."
            : "It will be available for sale again in every branch and included in stock alerts."
        }
        confirmLabel={item.status === "active" ? "Deactivate item" : "Activate item"}
        destructive={item.status === "active"}
        onConfirm={() => toggle.run(nextStatus)}
      />
    </>
  );
}
