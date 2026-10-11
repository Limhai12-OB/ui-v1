"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CalendarClock, CheckCircle2, CircleDollarSign, FilePlus2, FileText, Stamp, Wallet, XCircle, type LucideIcon } from "lucide-react";
import type { Bill, BillStatus } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { billService } from "@/lib/api";
import { billStatus, billTotals } from "@/lib/domain";
import { formatDate, formatDateTime, today } from "@/lib/date";
import { CURRENCY_META } from "@/lib/currency";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_NAME, dueInfo } from "./bill-utils";
import { RecordPaymentDialog } from "./record-payment-dialog";

export function BillDetailPage({ id }: { id: string }) {
  const bill = useAppStore((s) => s.bills.find((b) => b.id === id));
  const { inScope } = useScope();

  if (!bill || !inScope(bill.branchId)) {
    return (
      <EmptyState
        icon={FileText}
        title="Bill not found"
        description="This bill doesn't exist or belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/bills">Back to bills</Link>
          </Button>
        }
      />
    );
  }
  return <BillDetail bill={bill} />;
}

function BillDetail({ bill }: { bill: Bill }) {
  const { branchName, categoryName, accountName } = useLookups();
  const status = billStatus(bill);
  const { total, paid, balance } = billTotals(bill);
  const due = dueInfo(bill, status);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  const [payOpen, setPayOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const approve = useAction((bid: string) => billService.approve(bid), { success: `${bill.number} approved and open for payment` });
  const voidBill = useAction((bid: string) => billService.void(bid), { success: `${bill.number} voided` });

  const canPay = status === "open" || status === "partially_paid" || status === "overdue";
  const canApprove = status === "draft";
  const canVoid = status !== "void" && bill.payments.length === 0;

  const payments = useMemo(() => [...bill.payments].sort((a, b) => a.date.localeCompare(b.date)), [bill.payments]);

  return (
    <>
      <PageHeader
        backHref="/bills"
        backLabel="Bills"
        title={<span className="tabular-nums">{bill.number}</span>}
        meta={<StatusBadge status={status} />}
        description={
          <>
            <span className="font-medium text-foreground">{bill.supplier}</span> · {bill.description}
          </>
        }
        actions={
          <>
            {canVoid && (
              <Button variant="outline" onClick={() => setVoidOpen(true)}>
                <Ban /> Void
              </Button>
            )}
            {canApprove && (
              <Button onClick={() => setApproveOpen(true)}>
                <Stamp /> Approve bill
              </Button>
            )}
            {canPay && (
              <Button onClick={() => setPayOpen(true)}>
                <CircleDollarSign /> Record payment
              </Button>
            )}
          </>
        }
      />

      {status === "draft" && (
        <div role="status" className="mb-6 flex items-start gap-2 rounded-lg border bg-info-light px-4 py-3 text-sm text-info-text">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>This bill is a draft. It isn&apos;t counted in payables and can&apos;t be paid until it&apos;s approved.</p>
        </div>
      )}
      {status === "void" && (
        <div role="status" className="mb-6 flex items-start gap-2 rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>This bill was voided. It&apos;s kept for your records and excluded from payables.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bill details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Supplier", value: bill.supplier },
                  { label: "Branch", value: branchName(bill.branchId) },
                  { label: "Category", value: categoryName(bill.categoryId) },
                  { label: "Bill date", value: <span className="tabular-nums">{formatDate(bill.issueDate)}</span> },
                  {
                    label: "Due date",
                    value: (
                      <span className="tabular-nums">
                        {formatDate(bill.dueDate)}
                        {due.label && <span className={cn("ml-1.5 text-xs", due.tone === "overdue" ? "font-medium text-error-text" : "text-muted-foreground")}>({due.label})</span>}
                      </span>
                    ),
                  },
                  { label: "Currency", value: `${bill.currency} – ${CURRENCY_META[bill.currency].label}` },
                  { label: "Source", value: bill.source === "document_import" ? "Document import (supplier bill)" : "Entered manually" },
                  { label: "Created", value: <span className="tabular-nums">{formatDateTime(bill.createdAt)}</span> },
                  { label: "Description", value: bill.description, className: "sm:col-span-2" },
                ]}
              />
            </CardContent>
          </Card>

          <section aria-labelledby="payments-heading">
            <SectionHeader title={<span id="payments-heading">Payments</span>} description={payments.length ? `${payments.length} ${payments.length === 1 ? "payment" : "payments"} recorded` : undefined} />
            <Card className="gap-0 py-0">
              {payments.length === 0 ? (
                <EmptyState
                  compact
                  icon={Wallet}
                  title="No payments yet"
                  description={canPay ? "Record a payment when you pay this supplier. A matching expense transaction is created automatically." : status === "draft" ? "Approve this bill before recording payments." : undefined}
                  action={
                    canPay && (
                      <Button size="sm" onClick={() => setPayOpen(true)}>
                        <CircleDollarSign /> Record payment
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-10 bg-muted/40 pl-4 text-xs">Date</TableHead>
                        <TableHead className="h-10 bg-muted/40 text-xs">Method</TableHead>
                        <TableHead className="h-10 bg-muted/40 text-xs">Account</TableHead>
                        <TableHead className="h-10 bg-muted/40 text-xs">Reference</TableHead>
                        <TableHead className="h-10 bg-muted/40 text-right text-xs">Amount</TableHead>
                        <TableHead className="h-10 bg-muted/40 pr-4 text-right text-xs">
                          <span className="sr-only">Transaction</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="pl-4 whitespace-nowrap tabular-nums">{formatDate(p.date)}</TableCell>
                          <TableCell className="whitespace-nowrap">{PAYMENT_METHOD_NAME[p.method] ?? p.method}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Link href={`/accounts/${p.accountId}`} className="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                              {accountName(p.accountId)}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-muted-foreground" title={p.note}>
                            {p.reference || "—"}
                            {p.note && <span className="block truncate text-xs">{p.note}</span>}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <Money amount={p.amount} currency={bill.currency} />
                          </TableCell>
                          <TableCell className="pr-4 text-right whitespace-nowrap">
                            <Link href={`/transactions/${p.transactionId}`} className="text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                              View transaction<span className="sr-only"> for payment on {formatDate(p.date)}</span>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="pl-4 text-sm font-medium">
                          Total paid
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <Money amount={paid} currency={bill.currency} />
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Balance due</p>
                <p className={cn("text-2xl font-semibold tracking-tight", status === "overdue" && "text-error-text")}>
                  {status === "void" ? <span className="text-muted-foreground">—</span> : <Money amount={balance} currency={bill.currency} />}
                </p>
              </div>
              <div className="space-y-1.5">
                <Progress value={pct} className="h-2" aria-label={`${pct}% paid`} />
                <p className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{pct}% paid</span>
                  <span>
                    <Money amount={paid} currency={bill.currency} /> of <Money amount={total} currency={bill.currency} />
                  </span>
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Paid</dt>
                  <dd className="font-medium">
                    <Money amount={paid} currency={bill.currency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Bill total</dt>
                  <dd className="font-medium">
                    <Money amount={total} currency={bill.currency} />
                  </dd>
                </div>
              </dl>
              {canPay && (
                <Button className="w-full" variant="outline" onClick={() => setPayOpen(true)}>
                  <CircleDollarSign /> Record payment
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Due tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline bill={bill} status={status} />
            </CardContent>
          </Card>
        </aside>
      </div>

      {canPay && <RecordPaymentDialog bill={bill} open={payOpen} onOpenChange={setPayOpen} />}
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Approve ${bill.number}?`}
        description="The bill becomes open for payment and is included in payables and due-date reminders."
        confirmLabel="Approve bill"
        onConfirm={() => approve.run(bill.id)}
      />
      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`Void ${bill.number}?`}
        description={
          <>
            Voiding removes this <Money amount={total} currency={bill.currency} /> bill from payables. It stays on record as void and can&apos;t be paid or reopened.
          </>
        }
        confirmLabel="Void bill"
        destructive
        onConfirm={() => voidBill.run(bill.id)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

type TimelineTone = "done" | "pending" | "warning" | "danger" | "muted";
interface TimelineEvent {
  key: string;
  icon: LucideIcon;
  title: React.ReactNode;
  date?: string;
  detail?: React.ReactNode;
  tone: TimelineTone;
  sort: string;
}

const TONE_CLASS: Record<TimelineTone, string> = {
  done: "bg-success-light text-success-text",
  pending: "bg-muted text-muted-foreground",
  warning: "bg-warning-light text-warning-text",
  danger: "bg-error-light text-error-text",
  muted: "bg-muted text-muted-foreground",
};

function Timeline({ bill, status }: { bill: Bill; status: BillStatus }) {
  const { accountName } = useLookups();
  const created = bill.createdAt.slice(0, 10);
  const events: TimelineEvent[] = [];

  events.push({
    key: "created",
    icon: FilePlus2,
    title: "Bill received",
    date: formatDate(bill.issueDate),
    detail: `Recorded ${formatDateTime(bill.createdAt)}${bill.source === "document_import" ? " from a document import" : ""}`,
    tone: "done",
    sort: `${bill.issueDate < created ? bill.issueDate : created}-0`,
  });

  if (status === "draft") {
    events.push({ key: "approve", icon: Stamp, title: "Awaiting approval", detail: "Approve to make the bill payable.", tone: "pending", sort: `${created}-1` });
  } else if (status !== "void" || bill.payments.length > 0) {
    events.push({ key: "approve", icon: Stamp, title: "Approved", detail: "Open for payment", tone: "done", sort: `${created}-1` });
  }

  bill.payments.forEach((p, i) =>
    events.push({
      key: p.id,
      icon: Wallet,
      title: (
        <>
          Payment <Money amount={p.amount} currency={bill.currency} />
        </>
      ),
      date: formatDate(p.date),
      detail: `${PAYMENT_METHOD_NAME[p.method] ?? p.method} · ${accountName(p.accountId)}`,
      tone: "done",
      sort: `${p.date}-2-${i}`,
    }),
  );

  if (status !== "void") {
    const lastPayment = bill.payments.reduce<string | undefined>((m, p) => (!m || p.date > m ? p.date : m), undefined);
    const dueTone: TimelineTone = status === "paid" ? (lastPayment && lastPayment > bill.dueDate ? "warning" : "done") : status === "overdue" ? "danger" : "pending";
    const dueDetail =
      status === "paid"
        ? lastPayment && lastPayment > bill.dueDate
          ? "Paid after the due date"
          : "Paid on time"
        : status === "overdue"
          ? `Overdue · ${dueInfo(bill, status).label}`
          : `Upcoming · ${dueInfo(bill, status).label ?? ""}`;
    events.push({ key: "due", icon: CalendarClock, title: "Due date", date: formatDate(bill.dueDate), detail: dueDetail, tone: dueTone, sort: `${bill.dueDate}-3` });

    if (status === "paid" && lastPayment) {
      events.push({ key: "paid", icon: CheckCircle2, title: "Paid in full", date: formatDate(lastPayment), tone: "done", sort: `9999-${lastPayment}` });
    } else {
      events.push({ key: "paid", icon: CheckCircle2, title: "Paid in full", detail: "Not yet", tone: "muted", sort: "9999-z" });
    }
  } else {
    events.push({ key: "void", icon: Ban, title: "Voided", detail: "Excluded from payables", tone: "muted", sort: "9999-z" });
  }

  events.sort((a, b) => a.sort.localeCompare(b.sort));
  const todayISO = today();
  const showToday = status !== "paid" && status !== "void";
  const todayIndex = showToday ? events.findIndex((e) => e.sort.slice(0, 10) > todayISO) : -1;

  return (
    <ol className="relative space-y-4" aria-label="Bill timeline">
      {events.map((e, i) => {
        const Icon = e.icon;
        return (
          <li key={e.key} className="relative">
            {i === todayIndex && (
              <div className="mb-4 flex items-center gap-2 text-xs font-medium text-primary" aria-label="Today">
                <span className="h-px flex-1 bg-primary/40" aria-hidden />
                Today · {formatDate(todayISO)}
                <span className="h-px flex-1 bg-primary/40" aria-hidden />
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", TONE_CLASS[e.tone])}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
              </div>
              <div className="min-w-0 pb-1">
                <p className={cn("text-sm font-medium", e.tone === "muted" || e.tone === "pending" ? "text-muted-foreground" : "text-foreground")}>{e.title}</p>
                {e.date && <p className="text-xs text-muted-foreground tabular-nums">{e.date}</p>}
                {e.detail && <p className={cn("text-xs", e.tone === "danger" ? "font-medium text-error-text" : e.tone === "warning" ? "text-warning-text" : "text-muted-foreground")}>{e.detail}</p>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
