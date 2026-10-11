"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ClipboardList, CreditCard, ExternalLink, FilePlus2, FileText, Pencil, Receipt, Send, Store, Wallet } from "lucide-react";
import type { Invoice, Payment, PlannedPurchase } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { invoiceStatus, invoiceTotals, plannedPurchaseStatus, plannedPurchaseTotal } from "@/lib/domain";
import { formatDate, relativeDays } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat";
import { DetailList } from "@/components/shared/detail-list";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurrencyAmounts } from "@/features/sales-shared/components";
import { PAYMENT_METHOD_LABEL } from "@/features/sales-shared/lines";
import { customerStats, emptyStats } from "./customer-stats";
import { CustomerForm } from "./customer-form";

type PaymentRow = Payment & { invoice: Invoice };

export function CustomerDetail({ id }: { id: string }) {
  const router = useRouter();
  const customer = useAppStore((s) => s.customers.find((c) => c.id === id));
  const allInvoices = useAppStore((s) => s.invoices);
  const allPlanned = useAppStore((s) => s.plannedPurchases);
  const { inScope } = useScope();
  const { branchName, accountName } = useLookups();
  const [editOpen, setEditOpen] = useState(false);

  const invoices = useMemo(() => allInvoices.filter((i) => i.customerId === id), [allInvoices, id]);
  const planned = useMemo(() => allPlanned.filter((p) => p.customerId === id), [allPlanned, id]);
  const stats = useMemo(() => customerStats(invoices).get(id) ?? emptyStats(), [invoices, id]);
  const payments = useMemo<PaymentRow[]>(() => invoices.flatMap((inv) => inv.payments.map((p) => ({ ...p, invoice: inv }))), [invoices]);

  const invoiceCols = useMemo<ColumnDef<Invoice, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: ({ column }) => <SortHeader column={column} title="Invoice" />,
        cell: ({ row }) => (
          <Link href={`/invoices/${row.original.id}`} className="font-medium tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.number}
          </Link>
        ),
      },
      { accessorKey: "issueDate", header: ({ column }) => <SortHeader column={column} title="Issued" />, cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue() as string)}</span> },
      { accessorKey: "dueDate", header: "Due", cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue() as string)}</span> },
      { id: "total", accessorFn: (i) => invoiceTotals(i).total, header: "Total", meta: { align: "right" }, cell: ({ row }) => <Money amount={invoiceTotals(row.original).total} currency={row.original.currency} /> },
      { id: "balance", accessorFn: (i) => invoiceTotals(i).balance, header: "Balance", meta: { align: "right" }, cell: ({ row }) => <Money amount={invoiceTotals(row.original).balance} currency={row.original.currency} className="font-medium" /> },
      { id: "status", accessorFn: (i) => invoiceStatus(i), header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    ],
    [],
  );

  const paymentCols = useMemo<ColumnDef<PaymentRow, unknown>[]>(
    () => [
      { accessorKey: "date", header: ({ column }) => <SortHeader column={column} title="Date" />, cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue() as string)}</span> },
      {
        id: "invoice",
        accessorFn: (p) => p.invoice.number,
        header: "Invoice",
        cell: ({ row }) => (
          <Link href={`/invoices/${row.original.invoice.id}`} className="tabular-nums hover:underline">
            {row.original.invoice.number}
          </Link>
        ),
      },
      { accessorKey: "method", header: "Method", cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { accessorKey: "accountId", header: "Account", cell: ({ row }) => accountName(row.original.accountId) },
      { accessorKey: "reference", header: "Reference", cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) || "—"}</span> },
      { accessorKey: "amount", header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />, meta: { align: "right" }, cell: ({ row }) => <Money amount={row.original.amount} currency={row.original.invoice.currency} className="font-medium text-success-text" /> },
      {
        id: "tx",
        header: () => <span className="sr-only">Transaction</span>,
        meta: { align: "right" },
        cell: ({ row }) => (
          <Button variant="ghost" size="xs" asChild>
            <Link href={`/transactions/${row.original.transactionId}`}>
              Transaction <ExternalLink />
            </Link>
          </Button>
        ),
      },
    ],
    [accountName],
  );

  const ppCols = useMemo<ColumnDef<PlannedPurchase, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Number",
        cell: ({ row }) => (
          <Link href={`/planned-purchases/${row.original.id}`} className="font-medium tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.number}
          </Link>
        ),
      },
      { accessorKey: "createdDate", header: ({ column }) => <SortHeader column={column} title="Created" />, cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue() as string)}</span> },
      { accessorKey: "validUntil", header: "Valid until", cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue() as string)}</span> },
      { id: "total", accessorFn: plannedPurchaseTotal, header: "Estimated total", meta: { align: "right" }, cell: ({ row }) => <Money amount={plannedPurchaseTotal(row.original)} currency={row.original.currency} /> },
      { id: "status", accessorFn: (p) => plannedPurchaseStatus(p), header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
    ],
    [],
  );

  if (!customer || !inScope(customer.branchId)) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer doesn't exist or belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  const wholesale = customer.type === "wholesale";

  return (
    <>
      <PageHeader
        backHref="/customers"
        backLabel="Customers"
        title={customer.name}
        meta={
          <>
            <Badge variant={wholesale ? "info" : "neutral"}>{wholesale ? "Wholesale" : "Walk-in regular"}</Badge>
            {stats.overdueCount > 0 && <StatusBadge status="overdue" label={`${stats.overdueCount} overdue`} />}
          </>
        }
        description={`${branchName(customer.branchId)} · ${wholesale ? `${customer.paymentTermsDays}-day payment terms` : "Pays at the counter"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
            {wholesale ? (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/planned-purchases/new?customer=${customer.id}`}>
                    <ClipboardList /> New planned purchase
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/invoices/new?customer=${customer.id}`}>
                    <FilePlus2 /> Create invoice
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link href="/walk-in-sales/new">
                  <Store /> Record walk-in sale
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card className="h-fit gap-4 p-5">
          <h2 className="text-sm font-semibold">Profile</h2>
          <DetailList
            columns={1}
            items={[
              { label: "Contact person", value: customer.contactName },
              { label: "Phone", value: <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="tabular-nums hover:underline">{customer.phone}</a> },
              { label: "Email", value: customer.email ? <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a> : undefined },
              { label: "Telegram", value: customer.telegram },
              { label: "Address", value: customer.address },
              { label: "Branch", value: branchName(customer.branchId) },
              { label: "Payment terms", value: wholesale ? `${customer.paymentTermsDays} days` : "Immediate" },
              { label: "Customer since", value: formatDate(customer.createdAt.slice(0, 10)) },
              ...(customer.notes ? [{ label: "Notes", value: customer.notes }] : []),
            ]}
          />
        </Card>

        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatCard label="Outstanding" icon={Wallet} value={<CurrencyAmounts values={stats.outstanding} />} description={`${stats.openCount} open ${stats.openCount === 1 ? "invoice" : "invoices"}`} />
            <StatCard
              label="Overdue"
              icon={AlertTriangle}
              value={<CurrencyAmounts values={stats.overdue} className={stats.overdueCount ? "text-error-text" : undefined} />}
              description={stats.overdueCount ? `${stats.overdueCount} overdue · oldest due ${relativeDays(stats.oldestOverdueDue!)}` : "Nothing overdue"}
            />
            <StatCard label="Invoiced this year" icon={FileText} value={<CurrencyAmounts values={stats.invoicedYtd} />} description="Sent invoices, excluding drafts and cancelled" />
            <StatCard label="Total paid" icon={CreditCard} value={<CurrencyAmounts values={stats.paid} />} description={`${payments.length} ${payments.length === 1 ? "payment" : "payments"} received`} />
          </div>

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
              <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
              <TabsTrigger value="planned">Planned purchases ({planned.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="invoices" className="mt-3">
              <SectionHeader title="Invoice history" className="sr-only" />
              <Card className="gap-0 py-0">
                <DataTable
                  columns={invoiceCols}
                  data={invoices}
                  searchPlaceholder="Search invoices…"
                  getRowId={(i) => i.id}
                  onRowClick={(i) => router.push(`/invoices/${i.id}`)}
                  initialSorting={[{ id: "issueDate", desc: true }]}
                  empty={
                    <EmptyState
                      compact
                      icon={Receipt}
                      title="No invoices yet"
                      action={
                        wholesale && (
                          <Button size="sm" asChild>
                            <Link href={`/invoices/new?customer=${customer.id}`}>Create invoice</Link>
                          </Button>
                        )
                      }
                    />
                  }
                />
              </Card>
            </TabsContent>
            <TabsContent value="payments" className="mt-3">
              <Card className="gap-0 py-0">
                <DataTable
                  columns={paymentCols}
                  data={payments}
                  searchPlaceholder="Search payments…"
                  getRowId={(p) => p.id}
                  initialSorting={[{ id: "date", desc: true }]}
                  empty={<EmptyState compact icon={CreditCard} title="No payments recorded" description="Payments recorded on this customer's invoices appear here with their ledger transactions." />}
                />
              </Card>
            </TabsContent>
            <TabsContent value="planned" className="mt-3">
              <Card className="gap-0 py-0">
                <DataTable
                  columns={ppCols}
                  data={planned}
                  bare
                  getRowId={(p) => p.id}
                  onRowClick={(p) => router.push(`/planned-purchases/${p.id}`)}
                  initialSorting={[{ id: "createdDate", desc: true }]}
                  empty={
                    <EmptyState
                      compact
                      icon={Send}
                      title="No planned purchases"
                      description="Send an estimate before delivery and convert it to an invoice once accepted."
                      action={
                        wholesale && (
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/planned-purchases/new?customer=${customer.id}`}>New planned purchase</Link>
                          </Button>
                        )
                      }
                    />
                  }
                />
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Changes apply to future invoices. Existing invoices keep their due dates.</DialogDescription>
          </DialogHeader>
          {editOpen && <CustomerForm layout="dialog" guard={false} customer={customer} onSaved={() => setEditOpen(false)} onCancel={() => setEditOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
