"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, Mic, Plus, Wallet } from "lucide-react";
import type { Invoice, InvoiceStatus } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { invoiceStatus, invoiceTotals } from "@/lib/domain";
import { receivables, type ConvertedSum } from "@/lib/analytics";
import { convert, roundMoney } from "@/lib/currency";
import { formatDate, monthKey, relativeDays, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat";
import { ConversionNote, ConvertedMoney, Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Row = Invoice & { status: InvoiceStatus; customerLabel: string; total: number; balance: number };
type Tab = "all" | InvoiceStatus;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "partially_paid", label: "Partially paid" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
  { id: "cancelled", label: "Cancelled" },
];

export function InvoicesPage() {
  const router = useRouter();
  const invoices = useAppStore((s) => s.invoices);
  const { inScope, scope, money, isOwner, branches } = useScope();
  const { customerName, branchName } = useLookups();
  const loading = useInitialLoad();
  const [tab, setTab] = useState<Tab>("all");

  const rows = useMemo<Row[]>(
    () =>
      invoices
        .filter((i) => inScope(i.branchId))
        .map((i) => {
          const t = invoiceTotals(i);
          return { ...i, status: invoiceStatus(i), customerLabel: customerName(i.customerId), total: t.total, balance: t.balance };
        }),
    [invoices, inScope, customerName],
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    for (const r of rows) m[r.status] = (m[r.status] ?? 0) + 1;
    return m;
  }, [rows]);
  const data = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  const ar = useMemo(() => receivables(invoices, scope, money), [invoices, scope, money]);
  const paidThisMonth = useMemo(() => {
    const month = monthKey(today());
    const sum: ConvertedSum = { value: 0, converted: false, excludedForeign: false };
    let count = 0;
    for (const inv of invoices) {
      if (!inScope(inv.branchId)) continue;
      for (const p of inv.payments) {
        if (monthKey(p.date) !== month) continue;
        count++;
        if (inv.currency === money.display) sum.value += p.amount;
        else {
          const c = convert(p.amount, inv.currency, money.display, money.rate);
          if (c === null) sum.excludedForeign = true;
          else {
            sum.value += c;
            sum.converted = true;
          }
        }
      }
    }
    return { sum: { ...sum, value: roundMoney(sum.value, money.display) }, count };
  }, [invoices, inScope, money]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <SortHeader column={column} title="Invoice" />,
        meta: { label: "Invoice" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Link href={`/invoices/${row.original.id}`} className="font-medium tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.original.number}
            </Link>
            {row.original.source !== "manual" && <SourceIcon source={row.original.source} />}
          </div>
        ),
      },
      { accessorKey: "customerLabel", header: ({ column }) => <SortHeader column={column} title="Customer" />, meta: { label: "Customer" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { id: "branch", accessorFn: (r) => r.branchId, header: "Branch", meta: { label: "Branch" }, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{branchName(row.original.branchId)}</span> },
      { accessorKey: "issueDate", header: ({ column }) => <SortHeader column={column} title="Issued" />, meta: { label: "Issued" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue() as string)}</span> },
      {
        accessorKey: "dueDate",
        header: ({ column }) => <SortHeader column={column} title="Due" />,
        meta: { label: "Due" },
        cell: ({ row }) => {
          const r = row.original;
          const open = r.status === "sent" || r.status === "partially_paid" || r.status === "overdue";
          return (
            <div className="whitespace-nowrap">
              <p className="tabular-nums">{formatDate(r.dueDate)}</p>
              {open && <p className={cn("text-xs", r.status === "overdue" ? "text-error-text" : "text-muted-foreground")}>{r.status === "overdue" ? `Overdue · ${relativeDays(r.dueDate)}` : `Due ${relativeDays(r.dueDate)}`}</p>}
            </div>
          );
        },
      },
      { accessorKey: "total", header: ({ column }) => <SortHeader column={column} title="Total" align="right" />, meta: { align: "right", label: "Total" }, cell: ({ row }) => <Money amount={row.original.total} currency={row.original.currency} /> },
      {
        accessorKey: "balance",
        header: ({ column }) => <SortHeader column={column} title="Balance" align="right" />,
        meta: { align: "right", label: "Balance" },
        cell: ({ row }) => (row.original.status === "cancelled" || row.original.status === "draft" ? <span className="text-muted-foreground">—</span> : <Money amount={row.original.balance} currency={row.original.currency} className="font-medium" />),
      },
      { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ],
    [branchName],
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Bill wholesale customers, track what they owe and record payments into your accounts."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/invoices/voice">
                <Mic /> Voice-to-Invoice
              </Link>
            </Button>
            <Button asChild>
              <Link href="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-2 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" icon={Wallet} value={<ConvertedMoney sum={ar.total} currency={money.display} rate={money.rate} />} description={`${ar.count} open ${ar.count === 1 ? "invoice" : "invoices"}`} />
        <StatCard
          label="Overdue"
          icon={AlertTriangle}
          value={<ConvertedMoney sum={ar.overdue} currency={money.display} rate={money.rate} className={ar.overdueCount ? "text-error-text" : undefined} />}
          description={ar.overdueCount ? `${ar.overdueCount} past their due date` : "Nothing overdue"}
        />
        <StatCard label="Paid this month" icon={CheckCircle2} value={<ConvertedMoney sum={paidThisMonth.sum} currency={money.display} rate={money.rate} />} description={`${paidThisMonth.count} ${paidThisMonth.count === 1 ? "payment" : "payments"} in ${formatDate(today(), "MMMM")}`} />
      </div>
      <ConversionNote
        converted={ar.total.converted || paidThisMonth.sum.converted}
        excludedForeign={ar.total.excludedForeign || paidThisMonth.sum.excludedForeign}
        rate={money.rate}
        currency={money.display}
        className="mb-4"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4 mb-4">
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
          onRowClick={(r) => router.push(`/invoices/${r.id}`)}
          initialSorting={[{ id: "issueDate", desc: true }]}
          empty={
            <EmptyState
              icon={FileText}
              title={tab === "all" ? "No invoices yet" : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} invoices`}
              description={tab === "all" ? "Create an invoice by hand or dictate one with Voice-to-Invoice." : "Invoices move between tabs automatically as they're sent, paid or fall overdue."}
              action={
                tab === "all" && (
                  <Button size="sm" asChild>
                    <Link href="/invoices/new">
                      <Plus /> New invoice
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

function SourceIcon({ source }: { source: Invoice["source"] }) {
  const Icon = source === "voice" ? Mic : ClipboardList;
  const label = source === "voice" ? "Created with Voice-to-Invoice" : "Converted from a planned purchase";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-5 items-center justify-center rounded bg-muted text-muted-foreground" aria-label={label} role="img">
          <Icon className="size-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
