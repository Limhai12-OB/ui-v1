"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, CreditCard, ExternalLink, FilePlus2, Mic, Pencil, Printer, Send, Undo2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { invoiceService } from "@/lib/api";
import { invoiceStatus, invoiceTotals } from "@/lib/domain";
import { formatMoney } from "@/lib/currency";
import { daysBetween, formatDate, relativeDays, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BillTo, DocumentHeader, DocumentLines, PrintStyles, Timeline, TotalsRows, type TimelineEvent } from "@/features/sales-shared/components";
import { PAYMENT_METHOD_LABEL, stockShortfalls } from "@/features/sales-shared/lines";
import { RecordPaymentDialog } from "./record-payment-dialog";

export function InvoiceDetail({ id }: { id: string }) {
  const invoice = useAppStore((s) => s.invoices.find((i) => i.id === id));
  const customer = useAppStore((s) => s.customers.find((c) => c.id === invoice?.customerId));
  const planned = useAppStore((s) => s.plannedPurchases.find((p) => p.id === invoice?.plannedPurchaseId));
  const items = useAppStore((s) => s.items);
  const { inScope } = useScope();
  const { branchName, accountName } = useLookups();
  const [payOpen, setPayOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const send = useAction((invId: string) => invoiceService.send(invId), { success: "Invoice sent — stock deducted from the branch" });
  const cancel = useAction((invId: string) => invoiceService.cancel(invId), { success: "Invoice cancelled" });

  const shortfalls = useMemo(() => (invoice && invoice.baseStatus === "draft" ? stockShortfalls(invoice.lines, items, invoice.branchId) : []), [invoice, items]);

  if (!invoice || !inScope(invoice.branchId)) {
    return (
      <EmptyState
        title="Invoice not found"
        description="This invoice doesn't exist or belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/invoices">Back to invoices</Link>
          </Button>
        }
      />
    );
  }

  const status = invoiceStatus(invoice);
  const t = invoiceTotals(invoice);
  const isDraft = status === "draft";
  const isOpen = status === "sent" || status === "partially_paid" || status === "overdue";
  const canCancel = (isDraft || isOpen) && invoice.payments.length === 0;
  const daysOverdue = status === "overdue" ? daysBetween(invoice.dueDate, today()) : 0;
  const stockLineCount = invoice.lines.filter((l) => l.itemId).length;

  const events: TimelineEvent[] = [
    { id: "created", title: invoice.source === "voice" ? "Created with Voice-to-Invoice" : invoice.source === "planned_purchase" ? "Created from planned purchase" : "Created as draft", at: invoice.createdAt, icon: invoice.source === "voice" ? Mic : FilePlus2 },
    ...(invoice.sentAt ? [{ id: "sent", title: "Sent to customer", at: invoice.sentAt, icon: Send, tone: "info" as const, description: stockLineCount ? `${stockLineCount} stock ${stockLineCount === 1 ? "line" : "lines"} deducted from ${branchName(invoice.branchId)}` : undefined }] : []),
    ...[...invoice.payments]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ id: p.id, title: `Payment received · ${formatMoney(p.amount, invoice.currency)}`, at: p.date, dateOnly: true, icon: CreditCard, tone: "success" as const, description: `${PAYMENT_METHOD_LABEL[p.method]} to ${accountName(p.accountId)}` })),
    ...(status === "overdue" ? [{ id: "overdue", title: `Became overdue`, at: invoice.dueDate, dateOnly: true, icon: AlertTriangle, tone: "error" as const, description: `${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} past due` }] : []),
    ...(status === "paid" ? [{ id: "paid", title: "Paid in full", icon: CheckCircle2, tone: "success" as const }] : []),
    ...(status === "cancelled" ? [{ id: "cancelled", title: "Cancelled", icon: Ban, description: invoice.sentAt ? "Stock was returned to the branch" : undefined }] : []),
  ];

  return (
    <>
      <PrintStyles />
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        title={invoice.number}
        meta={
          <>
            <StatusBadge status={status} />
            {invoice.source === "voice" && (
              <Badge variant="ai">
                <Mic aria-hidden /> Voice
              </Badge>
            )}
          </>
        }
        description={
          <>
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            ) : (
              "Unknown customer"
            )}{" "}
            · {branchName(invoice.branchId)} · {invoice.currency}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            {canCancel && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban /> Cancel invoice
              </Button>
            )}
            {isDraft && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/invoices/${invoice.id}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
                <Button onClick={() => setSendOpen(true)}>
                  <Send /> Send invoice
                </Button>
              </>
            )}
            {isOpen && (
              <Button onClick={() => setPayOpen(true)}>
                <CreditCard /> Record payment
              </Button>
            )}
          </>
        }
      />

      {status === "overdue" && (
        <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-error/30 bg-error-light px-4 py-3 text-sm text-error-text">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {daysOverdue} {daysOverdue === 1 ? "day" : "days"} overdue.
            </span>{" "}
            {formatMoney(t.balance, invoice.currency)} was due {formatDate(invoice.dueDate)}. Follow up with {customer?.contactName ?? customer?.name ?? "the customer"}
            {customer?.phone ? ` on ${customer.phone}` : ""}.
          </p>
          <Button size="sm" onClick={() => setPayOpen(true)}>
            Record payment
          </Button>
        </div>
      )}

      {isDraft && shortfalls.length > 0 && (
        <div role="status" className="mb-6 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Not enough stock to send: {shortfalls.map((s) => `${s.item.name} (${s.available} available, ${s.requested} needed)`).join("; ")}. Edit the draft or restock {branchName(invoice.branchId)} first.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="gap-6 p-6 sm:p-8" data-print-root>
          <DocumentHeader
            title={isDraft ? "Draft invoice" : "Invoice"}
            number={invoice.number}
            branchId={invoice.branchId}
            meta={[
              { label: "Issue date", value: formatDate(invoice.issueDate) },
              { label: "Due date", value: formatDate(invoice.dueDate) },
              { label: "Currency", value: invoice.currency },
            ]}
          />
          <Separator />
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <BillTo customer={customer} />
            <div className="sm:text-right">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Balance due</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(status === "cancelled" ? 0 : t.balance, invoice.currency)}</p>
              <div className="mt-1 sm:flex sm:justify-end">
                <StatusBadge status={status} />
              </div>
            </div>
          </div>
          <DocumentLines lines={invoice.lines} currency={invoice.currency} />
          <TotalsRows
            rows={[
              { label: "Subtotal", value: <Money amount={t.subtotal} currency={invoice.currency} /> },
              ...(t.discount ? [{ label: "Discount", value: <Money amount={-t.discount} currency={invoice.currency} /> }] : []),
              { label: invoice.taxRate ? `VAT ${invoice.taxRate}%` : "VAT (not applied)", value: <Money amount={t.tax} currency={invoice.currency} /> },
              { label: "Total", value: <Money amount={t.total} currency={invoice.currency} />, strong: true },
              ...(t.paid ? [{ label: "Paid", value: <Money amount={-t.paid} currency={invoice.currency} />, tone: "success" as const }] : []),
              ...(status !== "cancelled" && status !== "draft" ? [{ label: "Balance due", value: <Money amount={t.balance} currency={invoice.currency} />, strong: true, tone: status === "overdue" ? ("error" as const) : undefined }] : []),
            ]}
          />
          {invoice.notes && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              <p className="mt-0.5 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">Thank you for your business.</p>
        </Card>

        <div className="space-y-6" data-print-hide>
          <Card className="gap-3 p-5">
            <h2 className="text-sm font-semibold">Summary</h2>
            <TotalsRows
              rows={[
                { label: "Invoice total", value: <Money amount={t.total} currency={invoice.currency} /> },
                { label: "Paid", value: <Money amount={t.paid} currency={invoice.currency} /> },
                { label: "Balance due", value: <Money amount={status === "cancelled" ? 0 : t.balance} currency={invoice.currency} />, strong: true },
              ]}
            />
            {isOpen && <p className="text-xs text-muted-foreground">Due {relativeDays(invoice.dueDate)} ({formatDate(invoice.dueDate)}).</p>}
            {planned && (
              <Link href={`/planned-purchases/${planned.id}`} className="mt-1 flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">
                  From planned purchase <span className="font-medium tabular-nums">{planned.number}</span>
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
              </Link>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="text-sm font-semibold">Payments</h2>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isOpen ? "No payments recorded yet." : isDraft ? "Send the invoice to start collecting payments." : "No payments."}</p>
            ) : (
              <ul className="divide-y">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <Money amount={p.amount} currency={invoice.currency} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.date)} · {PAYMENT_METHOD_LABEL[p.method]} · {accountName(p.accountId)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" size="xs" asChild>
                      <Link href={`/transactions/${p.transactionId}`} aria-label={`View transaction for payment on ${formatDate(p.date)}`}>
                        Transaction <ExternalLink />
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {isOpen && (
              <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
                <CreditCard /> Record payment
              </Button>
            )}
          </Card>

          <Card className="gap-4 p-5">
            <h2 className="text-sm font-semibold">Activity</h2>
            <Timeline events={events} />
          </Card>
        </div>
      </div>

      {isOpen && <RecordPaymentDialog invoice={invoice} open={payOpen} onOpenChange={setPayOpen} />}

      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        title={shortfalls.length ? "Not enough stock to send" : `Send ${invoice.number}?`}
        description={
          shortfalls.length
            ? `Edit the draft or restock ${branchName(invoice.branchId)} before sending.`
            : `${customer?.name ?? "The customer"} will owe ${formatMoney(t.total, invoice.currency)}, due ${formatDate(invoice.dueDate)}.${stockLineCount ? ` Sending deducts ${stockLineCount} stock ${stockLineCount === 1 ? "line" : "lines"} from ${branchName(invoice.branchId)}.` : ""}`
        }
        confirmLabel={shortfalls.length ? "OK" : "Send invoice"}
        onConfirm={() => (shortfalls.length ? undefined : send.run(invoice.id))}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        destructive
        title={`Cancel ${invoice.number}?`}
        description={
          invoice.baseStatus === "sent"
            ? `The invoice is removed from receivables and the ${stockLineCount} stock ${stockLineCount === 1 ? "line is" : "lines are"} returned to ${branchName(invoice.branchId)}. This can't be undone.`
            : "The draft is kept for reference but can no longer be sent. This can't be undone."
        }
        confirmLabel="Cancel invoice"
        cancelLabel="Keep invoice"
        onConfirm={() => cancel.run(invoice.id)}
      >
        {invoice.baseStatus === "sent" && stockLineCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Undo2 className="size-3.5" aria-hidden /> Stock return is recorded as a stock movement on each item.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
