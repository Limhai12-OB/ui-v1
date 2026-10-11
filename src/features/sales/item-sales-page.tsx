"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Boxes, Coins, Plus, Receipt, ShoppingCart } from "lucide-react";
import type { Currency, ID, PaymentMethod, Sale, SaleChannel } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { topSellingItems } from "@/lib/analytics";
import { formatMoney, formatNumber } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat";
import { ConvertedMoney, ConversionNote, Money } from "@/components/shared/money";
import { CardsSkeleton, ChartSkeleton, EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { AXIS_PROPS, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CHANNEL_LABEL, DATE_PRESETS, DatePresetSelect, PAYMENT_META, PaymentMethodLabel, presetRange, type DatePreset } from "./sales-shared";
import { useItemCategories, toConvertedSum } from "@/features/inventory/inventory-shared";
import { cn } from "@/lib/utils";

interface LineRow {
  id: string;
  saleId: ID;
  number: string;
  date: string;
  createdAt: string;
  itemId: ID;
  itemName: string;
  sku: string;
  categoryId: ID;
  quantity: number;
  unitPrice: number;
  currency: Currency;
  branchId: ID;
  channel: SaleChannel;
  paymentMethod: PaymentMethod;
}

export function ItemSalesPage() {
  const sales = useAppStore((s) => s.sales);
  const items = useAppStore((s) => s.items);
  const { scope, branches, money, inScope } = useScope();
  const { branchName, categoryName } = useLookups();
  const cats = useItemCategories();
  const loading = useInitialLoad();
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [metric, setMetric] = useState<"revenue" | "quantity">("revenue");

  const scopeBranches = branches.filter((b) => scope.branchIds.includes(b.id));
  const range = presetRange(preset);
  const effectiveScope = useMemo(() => (branchFilter === "all" ? scope : { branchIds: [branchFilter] }), [branchFilter, scope]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** Sales in range + scope with lines restricted to the category filter. */
  const filteredSales = useMemo<Sale[]>(() => {
    const out: Sale[] = [];
    for (const s of sales) {
      if (s.date < range.start || s.date > range.end || !effectiveScope.branchIds.includes(s.branchId) || !inScope(s.branchId)) continue;
      const lines = categoryFilter === "all" ? s.lines : s.lines.filter((l) => l.itemId && itemById.get(l.itemId)?.categoryId === categoryFilter);
      if (lines.length) out.push(lines === s.lines ? s : { ...s, lines });
    }
    return out;
  }, [sales, range.start, range.end, effectiveScope, inScope, categoryFilter, itemById]);

  const rows = useMemo<LineRow[]>(
    () =>
      filteredSales.flatMap((s) =>
        s.lines
          .filter((l) => l.itemId)
          .map((l) => {
            const it = itemById.get(l.itemId!);
            return {
              id: l.id,
              saleId: s.id,
              number: s.number,
              date: s.date,
              createdAt: s.createdAt,
              itemId: l.itemId!,
              itemName: it?.name ?? l.description,
              sku: it?.sku ?? "",
              categoryId: it?.categoryId ?? "",
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              currency: s.currency,
              branchId: s.branchId,
              channel: s.channel,
              paymentMethod: s.paymentMethod,
            };
          }),
      ),
    [filteredSales, itemById],
  );

  const all = useMemo(() => topSellingItems(filteredSales, items, range.start, range.end, effectiveScope, money, Number.MAX_SAFE_INTEGER), [filteredSales, items, range.start, range.end, effectiveScope, money]);
  const top = useMemo(() => [...all].sort((a, b) => b[metric] - a[metric]).slice(0, 8), [all, metric]);
  const units = all.reduce((s, x) => s + x.quantity, 0);
  const revenue = useMemo(() => toConvertedSum(rows.map((r) => ({ amount: r.quantity * r.unitPrice, currency: r.currency })), money.display, money.rate), [rows, money.display, money.rate]);
  const salesCount = filteredSales.length;

  const columns = useMemo<ColumnDef<LineRow, unknown>[]>(
    () => [
      {
        id: "date",
        accessorFn: (r) => `${r.date}|${r.createdAt}`,
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        meta: { label: "Date" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: "number",
        header: "Sale",
        cell: ({ row }) =>
          row.original.channel === "walk_in" ? (
            <Link href={`/walk-in-sales/${row.original.saleId}`} className="font-mono text-xs whitespace-nowrap hover:underline">
              {row.original.number}
            </Link>
          ) : (
            <span className="font-mono text-xs whitespace-nowrap">{row.original.number}</span>
          ),
      },
      {
        accessorKey: "itemName",
        header: ({ column }) => <SortHeader column={column} title="Item" />,
        meta: { label: "Item" },
        cell: ({ row }) => (
          <Link href={`/items/${row.original.itemId}`} className="block min-w-44 font-medium hover:underline">
            {row.original.itemName}
          </Link>
        ),
      },
      { accessorKey: "sku", header: "SKU", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { id: "category", accessorFn: (r) => r.categoryId, header: "Category", cell: ({ row }) => <span className="whitespace-nowrap">{categoryName(row.original.categoryId)}</span> },
      { accessorKey: "quantity", header: ({ column }) => <SortHeader column={column} title="Qty" align="right" />, meta: { align: "right", label: "Qty" } },
      { accessorKey: "unitPrice", header: "Unit price", meta: { align: "right" }, cell: ({ row }) => <Money amount={row.original.unitPrice} currency={row.original.currency} /> },
      {
        id: "total",
        accessorFn: (r) => r.quantity * r.unitPrice,
        header: ({ column }) => <SortHeader column={column} title="Line total" align="right" />,
        meta: { align: "right", label: "Line total" },
        cell: ({ row }) => <Money amount={row.original.quantity * row.original.unitPrice} currency={row.original.currency} className="font-medium" />,
      },
      { id: "branch", accessorFn: (r) => r.branchId, header: "Branch", cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span> },
      { id: "channel", accessorFn: (r) => r.channel, header: "Channel", cell: ({ row }) => CHANNEL_LABEL[row.original.channel] },
      { id: "payment", accessorFn: (r) => r.paymentMethod, header: "Payment", cell: ({ row }) => <PaymentMethodLabel method={row.original.paymentMethod} /> },
    ],
    [branchName, categoryName],
  );

  const periodLabel = DATE_PRESETS.find((p) => p.value === preset)?.label.toLowerCase();
  const chartHeight = Math.max(160, top.length * 36);

  return (
    <>
      <PageHeader
        title="Item sales"
        description="Line-level sales across walk-in and other channels. Use it to see what sells, where, and how it was paid."
        actions={
          <Button asChild>
            <Link href="/walk-in-sales/new">
              <Plus /> Record sale
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <DatePresetSelect value={preset} onChange={setPreset} />
        {scopeBranches.length > 1 && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className={cn("min-w-40", branchFilter !== "all" && "border-primary/50 bg-primary-light/40")} aria-label="Branch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches in view</SelectItem>
              {scopeBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={cn("min-w-40", categoryFilter !== "all" && "border-primary/50 bg-primary-light/40")} aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(preset !== "30d" || branchFilter !== "all" || categoryFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPreset("30d");
              setBranchFilter("all");
              setCategoryFilter("all");
            }}
          >
            Reset filters
          </Button>
        )}
      </div>

      {loading ? (
        <CardsSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={<ConvertedMoney sum={revenue} currency={money.display} rate={money.rate} />} icon={Coins} description={`Before receipt discounts · ${periodLabel}`} />
          <StatCard label="Units sold" value={formatNumber(units)} icon={Boxes} description={`${all.length} different items`} />
          <StatCard label="Sales" value={formatNumber(salesCount)} icon={Receipt} description={salesCount ? `${formatNumber(rows.length)} lines · ${(rows.length / salesCount).toFixed(1)} per sale` : "No sales"} />
          <StatCard
            label="Avg. line value"
            value={rows.length ? formatMoney(revenue.value / rows.length, money.display) : "—"}
            icon={ShoppingCart}
            description="Revenue ÷ sale lines"
          />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Top-selling items</CardTitle>
            <CardDescription>
              By {metric === "revenue" ? `revenue (${money.display})` : "units sold"} · {periodLabel}
            </CardDescription>
          </div>
          <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Rank by">
            {(["revenue", "quantity"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={metric === m}
                onClick={() => setMetric(m)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", metric === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {m === "revenue" ? "Revenue" : "Units"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ChartSkeleton height={240} />
          ) : top.length === 0 ? (
            <EmptyState compact icon={BarChart3} title="No sales in this period" description="Try a longer date range or a different branch." />
          ) : (
            <div style={{ height: chartHeight }} role="img" aria-label={`Horizontal bar chart of the top ${top.length} items by ${metric === "revenue" ? "revenue" : "units"}. Highest: ${top[0].name}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }} barCategoryGap={8}>
                  <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
                  <XAxis type="number" {...AXIS_PROPS} tickFormatter={metric === "revenue" ? moneyTick(money.display) : (v: number) => formatNumber(v)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    {...AXIS_PROPS}
                    width={200}
                    tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                      <text x={x - 6} y={y} dy={4} textAnchor="end" fontSize={12} fill="var(--muted-foreground)">
                        <title>{payload.value}</title>
                        {payload.value.length > 30 ? `${payload.value.slice(0, 29)}…` : payload.value}
                      </text>
                    )}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={
                      <ChartTooltip
                        valueFormatter={(v, e) => {
                          const p = e.payload as { quantity: number; revenue: number } | undefined;
                          return metric === "revenue" ? `${formatMoney(v, money.display)} · ${formatNumber(p?.quantity ?? 0)} units` : `${formatNumber(v)} units · ${formatMoney(p?.revenue ?? 0, money.display)}`;
                        }}
                      />
                    }
                  />
                  <Bar dataKey={metric} name={metric === "revenue" ? "Revenue" : "Units sold"} fill={SERIES.income} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    <LabelList dataKey={metric} position="right" className="fill-muted-foreground text-xs tabular-nums" formatter={(v: unknown) => (metric === "revenue" ? formatMoney(Number(v), money.display, { compact: true }) : formatNumber(Number(v)))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <ConversionNote converted={revenue.converted} excludedForeign={revenue.excludedForeign} rate={money.rate} currency={money.display} className="mt-3" />
        </CardContent>
      </Card>

      <Card className="mt-6 gap-0 py-0">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          searchPlaceholder="Search item, SKU or sale number…"
          searchFn={(r, q) => r.itemName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) || r.number.toLowerCase().includes(q)}
          getRowId={(r) => r.id}
          initialSorting={[{ id: "date", desc: true }]}
          initialHidden={["channel"]}
          pageSize={20}
          facets={[
            {
              columnId: "payment",
              label: "Payment methods",
              options: (Object.keys(PAYMENT_META) as PaymentMethod[]).filter((m) => rows.some((r) => r.paymentMethod === m)).map((m) => ({ value: m, label: PAYMENT_META[m].label })),
            },
          ]}
          empty={
            <EmptyState
              icon={ShoppingCart}
              title="No item sales in this period"
              action={
                <Button asChild size="sm">
                  <Link href="/walk-in-sales/new">
                    <Plus /> Record sale
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
