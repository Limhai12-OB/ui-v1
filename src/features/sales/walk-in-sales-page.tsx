"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Coins, Plus, Receipt, ShoppingBag, UserRound } from "lucide-react";
import type { PaymentMethod, Sale } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatMoney, formatNumber } from "@/lib/currency";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { percentChange, currentPeriods } from "@/lib/analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat";
import { ConvertedMoney, ConversionNote, Money } from "@/components/shared/money";
import { CardsSkeleton, EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePresetSelect, PAYMENT_META, PaymentMethodLabel, presetRange, saleTotal, type DatePreset } from "./sales-shared";
import { toConvertedSum } from "@/features/inventory/inventory-shared";
import { format, parseISO } from "date-fns";

export function WalkInSalesPage() {
  const router = useRouter();
  const sales = useAppStore((s) => s.sales);
  const { inScope, scope, branches, money } = useScope();
  const { branchName, customer } = useLookups();
  const loading = useInitialLoad();
  const [preset, setPreset] = useState<DatePreset>("30d");

  const walkIns = useMemo(() => sales.filter((s) => s.channel === "walk_in" && inScope(s.branchId)), [sales, inScope]);
  const data = useMemo(() => {
    const { start, end } = presetRange(preset);
    return walkIns.filter((s) => s.date >= start && s.date <= end);
  }, [walkIns, preset]);

  const kpis = useMemo(() => {
    const t = today();
    const p = currentPeriods(t);
    const sum = (list: Sale[]) => toConvertedSum(list.map((s) => ({ amount: saleTotal(s), currency: s.currency })), money.display, money.rate);
    const todays = walkIns.filter((s) => s.date === t);
    const yesterday = walkIns.filter((s) => s.date === addDaysISO(t, -1));
    const month = walkIns.filter((s) => s.date >= p.start && s.date <= p.end);
    const prevMonth = walkIns.filter((s) => s.date >= p.prevStart && s.date <= p.prevEnd);
    const todaySum = sum(todays);
    const monthSum = sum(month);
    const prevSum = sum(prevMonth);
    return {
      todayCount: todays.length,
      todaySum,
      todayDelta: percentChange(todaySum.value, sum(yesterday).value),
      monthCount: month.length,
      monthSum,
      monthDelta: percentChange(monthSum.value, prevSum.value),
      avgBasket: month.length ? monthSum.value / month.length : 0,
      regularShare: month.length ? (month.filter((s) => s.customerId).length / month.length) * 100 : 0,
    };
  }, [walkIns, money.display, money.rate]);

  const columns = useMemo<ColumnDef<Sale, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <SortHeader column={column} title="Number" />,
        meta: { label: "Number" },
        cell: ({ row }) => (
          <Link href={`/walk-in-sales/${row.original.id}`} className="font-mono text-xs whitespace-nowrap hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.number}
          </Link>
        ),
      },
      {
        id: "date",
        accessorFn: (s) => s.createdAt,
        header: ({ column }) => <SortHeader column={column} title="Date & time" />,
        meta: { label: "Date & time" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDate(row.original.date)} <span className="text-muted-foreground">{format(parseISO(row.original.createdAt), "HH:mm")}</span>
          </span>
        ),
      },
      { id: "branch", accessorFn: (s) => s.branchId, header: "Branch", cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span> },
      {
        id: "customer",
        accessorFn: (s) => (s.customerId ? "regular" : "anonymous"),
        header: "Customer",
        cell: ({ row }) =>
          row.original.customerId ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
              {customer(row.original.customerId)?.name ?? "Regular customer"}
            </span>
          ) : (
            <span className="text-muted-foreground">Walk-in (anonymous)</span>
          ),
      },
      {
        id: "items",
        accessorFn: (s) => s.lines.reduce((a, l) => a + l.quantity, 0),
        header: ({ column }) => <SortHeader column={column} title="Items" align="right" />,
        meta: { align: "right", label: "Items" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatNumber(row.original.lines.reduce((a, l) => a + l.quantity, 0))}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.lines.length} line{row.original.lines.length === 1 ? "" : "s"})</span>
          </span>
        ),
      },
      { id: "payment", accessorFn: (s) => s.paymentMethod, header: "Payment", cell: ({ row }) => <PaymentMethodLabel method={row.original.paymentMethod} /> },
      {
        id: "total",
        accessorFn: (s) => saleTotal(s),
        header: ({ column }) => <SortHeader column={column} title="Total" align="right" />,
        meta: { align: "right", label: "Total" },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.discount > 0 && <Badge variant="neutral">Discount</Badge>}
            <Money amount={saleTotal(row.original)} currency={row.original.currency} className="font-medium" />
          </span>
        ),
      },
    ],
    [branchName, customer],
  );

  const scopeBranches = branches.filter((b) => scope.branchIds.includes(b.id));
  const methods = (Object.keys(PAYMENT_META) as PaymentMethod[]).filter((m) => walkIns.some((s) => s.paymentMethod === m));

  return (
    <>
      <PageHeader
        title="Walk-in sales"
        description="Counter sales recorded at each branch. Each sale posts an income transaction and reduces branch stock."
        actions={
          <Button asChild>
            <Link href="/walk-in-sales/new">
              <Plus /> New walk-in sale
            </Link>
          </Button>
        }
      />
      {loading ? (
        <CardsSkeleton />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Today" value={<ConvertedMoney sum={kpis.todaySum} currency={money.display} rate={money.rate} />} icon={CalendarDays} delta={kpis.todayDelta} deltaLabel="vs yesterday" description={`${kpis.todayCount} sale${kpis.todayCount === 1 ? "" : "s"} · ${formatDate(today(), "d MMM")}`} />
          <StatCard label="This month" value={<ConvertedMoney sum={kpis.monthSum} currency={money.display} rate={money.rate} />} icon={Coins} delta={kpis.monthDelta} deltaLabel="vs same days last month" description={`${formatNumber(kpis.monthCount)} sales month to date`} />
          <StatCard label="Average basket" value={kpis.monthCount ? formatMoney(kpis.avgBasket, money.display) : "—"} icon={ShoppingBag} description="This month" />
          <StatCard label="Regular customers" value={`${kpis.regularShare.toFixed(0)}%`} icon={UserRound} description="Share of this month's sales with a loyalty customer" />
        </div>
      )}
      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search sale number or customer…"
          searchFn={(s, q) => s.number.toLowerCase().includes(q) || (s.customerId ? (customer(s.customerId)?.name ?? "").toLowerCase().includes(q) : "walk-in anonymous".includes(q))}
          getRowId={(s) => s.id}
          onRowClick={(s) => router.push(`/walk-in-sales/${s.id}`)}
          initialSorting={[{ id: "date", desc: true }]}
          pageSize={20}
          facets={[
            ...(scopeBranches.length > 1 ? [{ columnId: "branch", label: "Branches", options: scopeBranches.map((b) => ({ value: b.id, label: b.name })) }] : []),
            { columnId: "payment", label: "Payment methods", options: methods.map((m) => ({ value: m, label: PAYMENT_META[m].label })) },
            {
              columnId: "customer",
              label: "Customers",
              options: [
                { value: "anonymous", label: "Anonymous" },
                { value: "regular", label: "Regular customers" },
              ],
            },
          ]}
          toolbar={<DatePresetSelect value={preset} onChange={setPreset} />}
          empty={
            <EmptyState
              icon={Receipt}
              title={walkIns.length ? "No walk-in sales in this period" : "No walk-in sales yet"}
              description="Record a counter sale to post income and update stock."
              action={
                <Button asChild size="sm">
                  <Link href="/walk-in-sales/new">
                    <Plus /> New walk-in sale
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
      <ConversionNote converted={kpis.monthSum.converted} excludedForeign={kpis.monthSum.excludedForeign} rate={money.rate} currency={money.display} className="mt-3" />
    </>
  );
}

