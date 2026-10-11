"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, Clock, ExternalLink, FileEdit, Loader2, MessageSquareReply, Pencil, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import type { PlannedPurchaseStatus } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { plannedPurchaseService } from "@/lib/api";
import { documentTotals, plannedPurchaseStatus, plannedPurchaseTotal } from "@/lib/domain";
import { formatMoney, roundMoney } from "@/lib/currency";
import { addDaysISO, daysBetween, formatDate, relativeDays, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge, statusLabel } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Field } from "@/components/forms/field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BillTo, DocumentHeader, DocumentLines, PrintStyles, Timeline, TotalsRows, type TimelineEvent } from "@/features/sales-shared/components";
import { fromLineItems, VAT_RATE } from "@/features/sales-shared/lines";
import { PlannedPurchaseForm, toPlannedPurchasePayload, type PlannedPurchaseFormValues } from "./planned-purchase-form";
import { SendDialog, sendNote, type SendChannel } from "./send-dialog";

const HISTORY_ICON: Record<PlannedPurchaseStatus, { icon: typeof Send; tone: TimelineEvent["tone"] }> = {
  draft: { icon: FileEdit, tone: "neutral" },
  sent: { icon: Send, tone: "info" },
  accepted: { icon: CheckCircle2, tone: "success" },
  rejected: { icon: XCircle, tone: "error" },
  expired: { icon: Clock, tone: "neutral" },
  converted: { icon: ArrowRightLeft, tone: "ai" },
};

export function PlannedPurchaseDetail({ id }: { id: string }) {
  const router = useRouter();
  const pp = useAppStore((s) => s.plannedPurchases.find((p) => p.id === id));
  const customer = useAppStore((s) => s.customers.find((c) => c.id === pp?.customerId));
  const invoice = useAppStore((s) => s.invoices.find((i) => i.id === pp?.convertedInvoiceId));
  const { inScope } = useScope();
  const { branchName } = useLookups();
  const [editing, setEditing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [respondOpen, setRespondOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const editDefaults = useMemo<PlannedPurchaseFormValues | null>(
    () =>
      pp
        ? {
            customerId: pp.customerId,
            branchId: pp.branchId,
            currency: pp.currency,
            validUntil: pp.validUntil < today() ? addDaysISO(today(), 14) : pp.validUntil,
            expectedDeliveryDate: pp.expectedDeliveryDate && pp.expectedDeliveryDate >= today() ? pp.expectedDeliveryDate : "",
            lines: fromLineItems(pp.lines),
            discount: pp.discount,
            taxEnabled: false,
            notes: pp.notes ?? "",
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pp?.id, editing],
  );

  if (!pp || !inScope(pp.branchId)) {
    return (
      <EmptyState
        title="Planned purchase not found"
        description="This planned purchase doesn't exist or belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/planned-purchases">Back to planned purchases</Link>
          </Button>
        }
      />
    );
  }

  const status = plannedPurchaseStatus(pp);
  const totals = documentTotals(pp.lines, pp.discount, 0, pp.currency);
  const rejection = [...pp.history].reverse().find((h) => h.status === "rejected");

  const send = async (channel: SendChannel, validUntil?: string) => {
    try {
      if (validUntil) await plannedPurchaseService.update(pp.id, { validUntil });
      await plannedPurchaseService.setStatus(pp.id, "sent", sendNote(channel, customer, validUntil ? `validity extended to ${formatDate(validUntil)}` : undefined));
      toast.success(`${pp.number} sent (simulated)`, { description: "Recorded in the history. Nothing was actually delivered in the demo." });
    } catch (e) {
      toast.error("Couldn't send", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  if (editing && editDefaults && pp.status === "draft") {
    return (
      <>
        <PageHeader backHref={`/planned-purchases/${pp.id}`} backLabel={pp.number} title={`Edit ${pp.number}`} meta={<StatusBadge status="draft" />} description="Drafts can be changed until they're sent to the customer." />
        <PlannedPurchaseForm
          defaultValues={editDefaults}
          onCancel={() => setEditing(false)}
          onSubmit={async (v, channel) => {
            try {
              await plannedPurchaseService.update(pp.id, toPlannedPurchasePayload(v));
              if (channel) await plannedPurchaseService.setStatus(pp.id, "sent", sendNote(channel, useAppStore.getState().customers.find((c) => c.id === v.customerId)));
              toast.success(channel ? `${pp.number} saved and sent (simulated)` : `${pp.number} saved`);
              setEditing(false);
            } catch (e) {
              toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
              throw e;
            }
          }}
        />
      </>
    );
  }

  const events: TimelineEvent[] = pp.history.map((h, i) => ({
    id: `${i}`,
    title: h.status === "draft" ? "Created as draft" : statusLabel(h.status),
    at: h.at,
    description: h.note,
    icon: HISTORY_ICON[h.status].icon,
    tone: HISTORY_ICON[h.status].tone,
  }));
  if (status === "expired") events.push({ id: "expired", title: "Expired without a response", at: pp.validUntil, dateOnly: true, icon: Clock, tone: "warning" });

  return (
    <>
      <PrintStyles />
      <PageHeader
        backHref="/planned-purchases"
        backLabel="Planned purchases"
        title={pp.number}
        meta={<StatusBadge status={status} />}
        description={
          <>
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            ) : (
              "Unknown customer"
            )}{" "}
            · {branchName(pp.branchId)} · Estimated {formatMoney(plannedPurchaseTotal(pp), pp.currency)}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            {status === "draft" && (
              <>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit draft
                </Button>
                <Button onClick={() => setSendOpen(true)}>
                  <Send /> Send to customer
                </Button>
              </>
            )}
            {status === "sent" && (
              <>
                <Button variant="outline" onClick={() => setSendOpen(true)}>
                  <Send /> Send again
                </Button>
                <Button onClick={() => setRespondOpen(true)}>
                  <MessageSquareReply /> Record response
                </Button>
              </>
            )}
            {status === "expired" && (
              <Button onClick={() => setResendOpen(true)}>
                <RefreshCw /> Resend
              </Button>
            )}
            {status === "accepted" && (
              <Button onClick={() => setConvertOpen(true)}>
                <ArrowRightLeft /> Convert to invoice
              </Button>
            )}
            {status === "converted" && invoice && (
              <Button asChild>
                <Link href={`/invoices/${invoice.id}`}>
                  View {invoice.number} <ExternalLink />
                </Link>
              </Button>
            )}
          </>
        }
      />

      {status === "expired" && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">This offer expired {relativeDays(pp.validUntil)}</span> ({formatDate(pp.validUntil)}) without a response from {customer?.name ?? "the customer"}. Prices may have changed — extend the validity and resend it, or create a new planned purchase.
          </p>
          <Button size="sm" variant="outline" onClick={() => setResendOpen(true)}>
            <RefreshCw /> Extend & resend
          </Button>
        </div>
      )}
      {status === "accepted" && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success-light px-4 py-3 text-sm text-success-text">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">Accepted by the customer. Convert it to an invoice to bill them — lines, discount and currency carry over.</p>
          <Button size="sm" onClick={() => setConvertOpen(true)}>
            Convert to invoice
          </Button>
        </div>
      )}
      {status === "rejected" && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-error/30 bg-error-light px-4 py-3 text-sm text-error-text">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Rejected by the customer{rejection?.note ? `: “${rejection.note}”` : "."}{" "}
            <Link href={`/planned-purchases/new?customer=${pp.customerId}`} className="font-medium underline">
              Prepare a new estimate
            </Link>
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="gap-6 p-6 sm:p-8" data-print-root>
          <DocumentHeader
            title="Planned purchase / estimate"
            number={pp.number}
            branchId={pp.branchId}
            meta={[
              { label: "Date", value: formatDate(pp.createdDate) },
              { label: "Valid until", value: formatDate(pp.validUntil) },
              ...(pp.expectedDeliveryDate ? [{ label: "Expected delivery", value: formatDate(pp.expectedDeliveryDate) }] : []),
              { label: "Currency", value: pp.currency },
            ]}
          />
          <Separator />
          <BillTo customer={customer} label="Prepared for" />
          <DocumentLines lines={pp.lines} currency={pp.currency} />
          <TotalsRows
            rows={[
              { label: "Subtotal", value: <Money amount={totals.subtotal} currency={pp.currency} /> },
              ...(totals.discount ? [{ label: "Discount", value: <Money amount={-totals.discount} currency={pp.currency} /> }] : []),
              { label: "Estimated total", value: <Money amount={totals.total} currency={pp.currency} />, strong: true },
            ]}
          />
          <p className="text-xs text-muted-foreground">Estimate excludes VAT. Final amounts are confirmed on the invoice.</p>
          {pp.notes && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{pp.notes}</p>}
        </Card>

        <div className="space-y-6" data-print-hide>
          <Card className="gap-3 p-5">
            <h2 className="text-sm font-semibold">Status</h2>
            <div className="flex items-center gap-2">
              <StatusBadge status={status} />
              {status === "sent" && <span className="text-xs text-muted-foreground">Expires {relativeDays(pp.validUntil)}</span>}
            </div>
            {invoice && (
              <Link href={`/invoices/${invoice.id}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50">
                <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">
                  Converted to <span className="font-medium tabular-nums">{invoice.number}</span>
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
              </Link>
            )}
          </Card>
          <Card className="gap-4 p-5">
            <h2 className="text-sm font-semibold">History</h2>
            <Timeline events={events} />
          </Card>
        </div>
      </div>

      <SendDialog open={sendOpen} onOpenChange={setSendOpen} customer={customer} number={pp.number} onConfirm={(c) => send(c)} />
      <SendDialog open={resendOpen} onOpenChange={setResendOpen} customer={customer} number={pp.number} extendValidity currentValidUntil={pp.validUntil} onConfirm={(c, v) => send(c, v)} title={`Resend ${pp.number}`} />
      <RespondDialog open={respondOpen} onOpenChange={setRespondOpen} id={pp.id} number={pp.number} customerName={customer?.name} />
      <ConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        id={pp.id}
        number={pp.number}
        subtotal={totals.total}
        currency={pp.currency}
        terms={customer?.paymentTermsDays ?? 15}
        onConverted={(invId) => router.push(`/invoices/${invId}`)}
      />
    </>
  );
}

function RespondDialog({ open, onOpenChange, id, number, customerName }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; number: string; customerName?: string }) {
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  const [note, setNote] = useState("");
  const tooLong = note.length > 200;
  useEffect(() => {
    if (open) {
      setDecision("accepted");
      setNote("");
    }
  }, [open]);
  const act = useAction((d: "accepted" | "rejected", n: string) => plannedPurchaseService.setStatus(id, d, n.trim() || undefined), {
    success: decision === "accepted" ? `${number} marked accepted` : `${number} marked rejected`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !act.pending && onOpenChange(o)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record customer response</DialogTitle>
          <DialogDescription>What did {customerName ?? "the customer"} say about {number}?</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RadioGroup value={decision} onValueChange={(v) => setDecision(v as typeof decision)} className="grid grid-cols-2 gap-2">
            {[
              { v: "accepted", label: "Accepted", icon: CheckCircle2 },
              { v: "rejected", label: "Rejected", icon: XCircle },
            ].map((o) => (
              <Label key={o.v} htmlFor={`resp-${o.v}`} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-light/40">
                <RadioGroupItem id={`resp-${o.v}`} value={o.v} />
                <o.icon className="size-4 text-muted-foreground" aria-hidden />
                {o.label}
              </Label>
            ))}
          </RadioGroup>
          <Field label="Note" htmlFor="resp-note" error={tooLong ? "Keep the note under 200 characters" : undefined} helper={decision === "rejected" ? "Why did they decline? Helps when preparing the next estimate." : "e.g. Confirmed by phone with the purchasing manager."}>
            <Textarea id="resp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={tooLong} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={act.pending}>
            Cancel
          </Button>
          <Button variant={decision === "rejected" ? "danger" : "default"} onClick={() => act.fire(decision, note)} disabled={act.pending || tooLong}>
            {act.pending && <Loader2 className="animate-spin" />}
            Mark {decision}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const convertSchema = z
  .object({
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an issue date"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a due date"),
    vat: z.boolean(),
  })
  .refine((v) => v.dueDate >= v.issueDate, { path: ["dueDate"], message: "Due date can't be before the issue date" });
type ConvertValues = z.infer<typeof convertSchema>;

function ConvertDialog({
  open,
  onOpenChange,
  id,
  number,
  subtotal,
  currency,
  terms,
  onConverted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id: string;
  number: string;
  subtotal: number;
  currency: "USD" | "KHR";
  terms: number;
  onConverted: (invoiceId: string) => void;
}) {
  const form = useForm<ConvertValues>({ resolver: zodResolver(convertSchema), mode: "onChange", defaultValues: { issueDate: today(), dueDate: addDaysISO(today(), terms), vat: true } });
  const { register, control, handleSubmit, watch, setValue, formState, reset } = form;
  useEffect(() => {
    if (open) reset({ issueDate: today(), dueDate: addDaysISO(today(), terms), vat: true });
  }, [open, terms, reset]);
  const vat = watch("vat");
  const issue = watch("issueDate");
  const due = watch("dueDate");
  const tax = vat ? roundMoney((subtotal * VAT_RATE) / 100, currency) : 0;
  const convert = useAction((v: ConvertValues) => plannedPurchaseService.convert(id, { issueDate: v.issueDate, dueDate: v.dueDate, taxRate: v.vat ? VAT_RATE : 0 }), {
    success: (inv) => `${number} converted to ${inv.number} (draft)`,
    errorTitle: "Conversion failed",
    onSuccess: (inv) => {
      onOpenChange(false);
      onConverted(inv.id);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !convert.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((v) => convert.fire(v))} noValidate>
          <DialogHeader>
            <DialogTitle>Convert {number} to invoice</DialogTitle>
            <DialogDescription>Creates a draft invoice with the same customer, branch, currency, lines and discount. Review and send it to deduct stock.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <Field label="Issue date" htmlFor="cv-issue" required error={formState.errors.issueDate?.message}>
              <Input
                id="cv-issue"
                type="date"
                className="tabular-nums"
                {...register("issueDate", { onChange: (e) => e.target.value && setValue("dueDate", addDaysISO(e.target.value, terms), { shouldValidate: true }) })}
                aria-invalid={!!formState.errors.issueDate}
              />
            </Field>
            <Field label="Due date" htmlFor="cv-due" required error={formState.errors.dueDate?.message} helper={issue && due && !formState.errors.dueDate ? `${daysBetween(issue, due)}-day terms` : undefined}>
              <Input id="cv-due" type="date" className="tabular-nums" {...register("dueDate")} aria-invalid={!!formState.errors.dueDate} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="cv-vat" className="font-normal">
                Apply VAT {VAT_RATE}%
              </Label>
              <Controller control={control} name="vat" render={({ field }) => <Switch id="cv-vat" checked={field.value} onCheckedChange={field.onChange} />} />
            </div>
            <div className="sm:col-span-2">
              <TotalsRows
                rows={[
                  { label: "Estimate", value: <Money amount={subtotal} currency={currency} /> },
                  { label: `VAT ${vat ? `${VAT_RATE}%` : "(not applied)"}`, value: <Money amount={tax} currency={currency} /> },
                  { label: "Invoice total", value: <Money amount={roundMoney(subtotal + tax, currency)} currency={currency} />, strong: true },
                ]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={convert.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={convert.pending}>
              {convert.pending && <Loader2 className="animate-spin" />}
              Create invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
