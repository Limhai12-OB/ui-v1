"use client";

import { useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, ArrowRight, Info, Loader2, Save, Send } from "lucide-react";
import type { Currency, ID } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { addDaysISO, daysBetween, formatDate, today } from "@/lib/date";
import { documentTotals } from "@/lib/domain";
import { Field } from "@/components/forms/field";
import { BranchSelect, CurrencySelect, CustomerSelect } from "@/components/forms/entity-selects";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Steps } from "@/components/shared/steps";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LineItemsEditor } from "@/features/sales-shared/line-items-editor";
import { DocumentLines, TotalsRows } from "@/features/sales-shared/components";
import { discountSchema, emptyLine, linesArraySchema, refineLines, stockShortfalls, toLineItems, type LinesForm } from "@/features/sales-shared/lines";
import { SendDialog, type SendChannel } from "./send-dialog";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const plannedPurchaseSchema = z
  .object({
    customerId: z.string().min(1, "Select a customer"),
    branchId: z.string().min(1, "Select a branch"),
    currency: z.enum(["USD", "KHR"]),
    validUntil: z.string().regex(dateRe, "Enter how long the offer is valid"),
    expectedDeliveryDate: z.union([z.literal(""), z.string().regex(dateRe)]).optional(),
    lines: linesArraySchema,
    discount: discountSchema,
    taxEnabled: z.boolean().optional(),
    notes: z.string().max(500, "Keep notes under 500 characters").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.validUntil && v.validUntil < today()) ctx.addIssue({ code: "custom", path: ["validUntil"], message: "Valid-until can't be in the past" });
    if (v.expectedDeliveryDate && v.expectedDeliveryDate < today()) ctx.addIssue({ code: "custom", path: ["expectedDeliveryDate"], message: "Delivery date can't be in the past" });
    refineLines(v, ctx);
  });
export type PlannedPurchaseFormValues = z.infer<typeof plannedPurchaseSchema>;

export function plannedPurchaseDefaults(opts: { customerId?: ID; branchId?: ID; currency?: Currency } = {}): PlannedPurchaseFormValues {
  return {
    customerId: opts.customerId ?? "",
    branchId: opts.branchId ?? "",
    currency: opts.currency ?? "USD",
    validUntil: addDaysISO(today(), 14),
    expectedDeliveryDate: "",
    lines: [emptyLine()],
    discount: 0,
    taxEnabled: false,
    notes: "",
  };
}

export function toPlannedPurchasePayload(v: PlannedPurchaseFormValues) {
  return {
    customerId: v.customerId,
    branchId: v.branchId,
    currency: v.currency,
    validUntil: v.validUntil,
    expectedDeliveryDate: v.expectedDeliveryDate || undefined,
    lines: toLineItems(v.lines),
    discount: v.discount,
    notes: v.notes?.trim() || undefined,
  };
}

interface Props {
  defaultValues: PlannedPurchaseFormValues;
  onSubmit: (values: PlannedPurchaseFormValues, send?: SendChannel) => Promise<unknown>;
  onCancel: () => void;
  guard?: boolean;
}

const STEPS = [
  { id: "details", label: "Details & items" },
  { id: "review", label: "Review estimated total" },
];

/** Two-step planned purchase form: edit, then review the estimate before saving or sending. */
export function PlannedPurchaseForm({ defaultValues, onSubmit, onCancel, guard = true }: Props) {
  const form = useForm<PlannedPurchaseFormValues>({ resolver: zodResolver(plannedPurchaseSchema), mode: "onTouched", defaultValues });
  const { control, register, handleSubmit, setValue, getValues, trigger, formState } = form;
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  const { branches } = useScope();
  const { branchName } = useLookups();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const customerId = useWatch({ control, name: "customerId" });
  const customer = customers.find((c) => c.id === customerId);
  const e = formState.errors;

  const save = async (send?: SendChannel) => {
    setBusy(send ? "send" : "draft");
    setSaved(true);
    try {
      await onSubmit(getValues(), send);
    } catch (err) {
      setSaved(false);
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const toReview = async () => {
    const ok = await trigger();
    if (ok) {
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const v = getValues();
  const lineItems = step === 1 ? toLineItems(v.lines) : [];
  const totals = step === 1 ? documentTotals(lineItems, v.discount, 0, v.currency) : null;
  const shortfalls = step === 1 ? stockShortfalls(v.lines, items, v.branchId) : [];

  return (
    <form noValidate onSubmit={handleSubmit(toReview)} className="space-y-6 pb-4">
      {guard && <UnsavedChangesGuard when={formState.isDirty && !saved} />}
      <Steps steps={STEPS} current={step} />

      <div hidden={step !== 0} className="space-y-6">
        <Card className="gap-0 p-0">
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer" htmlFor="pp-customer" required error={e.customerId?.message} className="sm:col-span-2 lg:col-span-1">
              <Controller
                control={control}
                name="customerId"
                render={({ field }) => (
                  <CustomerSelect
                    id="pp-customer"
                    type="wholesale"
                    value={field.value || undefined}
                    aria-invalid={!!e.customerId}
                    onChange={(id) => {
                      field.onChange(id);
                      const c = customers.find((x) => x.id === id);
                      if (c && branches.some((b) => b.id === c.branchId)) setValue("branchId", c.branchId, { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                )}
              />
            </Field>
            <Field label="Branch" htmlFor="pp-branch" required error={e.branchId?.message} helper="Stock availability is checked at this branch.">
              <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="pp-branch" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!e.branchId} />} />
            </Field>
            <Field label="Currency" htmlFor="pp-currency" required helper="The converted invoice keeps this currency.">
              <Controller control={control} name="currency" render={({ field }) => <CurrencySelect id="pp-currency" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Valid until" htmlFor="pp-valid" required error={e.validUntil?.message} helper="After this date an unanswered offer is marked expired.">
              <Input id="pp-valid" type="date" min={today()} className="tabular-nums" {...register("validUntil")} aria-invalid={!!e.validUntil} />
            </Field>
            <Field label="Expected delivery" htmlFor="pp-delivery" error={e.expectedDeliveryDate?.message} helper="Optional — when the customer expects the goods.">
              <Input id="pp-delivery" type="date" min={today()} className="tabular-nums" {...register("expectedDeliveryDate")} aria-invalid={!!e.expectedDeliveryDate} />
            </Field>
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <div>
            <h2 className="text-base font-medium">Items</h2>
            <p className="text-xs text-muted-foreground">An estimate only — no stock is reserved or deducted until the converted invoice is sent. VAT is added when converting.</p>
          </div>
          <LineItemsEditor form={form as unknown as UseFormReturn<LinesForm>} showTax={false} totalLabel="Estimated total" stockHint="Planned purchases don't reserve stock; restock before converting and sending the invoice." />
        </Card>

        <Card className="p-5">
          <Field label="Notes for the customer" htmlFor="pp-notes" error={e.notes?.message}>
            <Textarea id="pp-notes" rows={3} {...register("notes")} placeholder="e.g. Prices valid while stock lasts. Delivery included within city limits." />
          </Field>
        </Card>
      </div>

      {step === 1 && totals && (
        <Card className="gap-5 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Estimate for</p>
              <p className="mt-1 text-base font-medium">{customer?.name}</p>
              <p className="text-muted-foreground">{branchName(v.branchId)} · {v.currency}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Estimated total</p>
              <p className="text-3xl font-semibold tabular-nums">
                <Money amount={totals.total} currency={v.currency} />
              </p>
              <p className="text-xs text-muted-foreground">
                Valid until {formatDate(v.validUntil)} ({daysBetween(today(), v.validUntil)} days){v.expectedDeliveryDate ? ` · delivery ${formatDate(v.expectedDeliveryDate)}` : ""}
              </p>
            </div>
          </div>
          <DocumentLines lines={lineItems} currency={v.currency} />
          <TotalsRows
            rows={[
              { label: "Subtotal", value: <Money amount={totals.subtotal} currency={v.currency} /> },
              ...(totals.discount ? [{ label: "Discount", value: <Money amount={-totals.discount} currency={v.currency} /> }] : []),
              { label: "Estimated total", value: <Money amount={totals.total} currency={v.currency} />, strong: true },
            ]}
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Excludes VAT. You choose whether to apply VAT when converting the accepted estimate into an invoice.
          </p>
          {shortfalls.length > 0 && (
            <p role="status" className="flex items-start gap-1.5 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Current stock at {branchName(v.branchId)} is short for {shortfalls.map((s) => `${s.item.name} (${s.available}/${s.requested})`).join(", ")}. You can still send the estimate.
            </p>
          )}
          {v.notes && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{v.notes}</p>}
        </Card>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 lg:-mx-8 lg:px-8">
        {step === 0 ? (
          <>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              Review estimated total <ArrowRight />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep(0)} disabled={!!busy}>
              <ArrowLeft /> Back to editing
            </Button>
            <Button type="button" variant="outline" onClick={() => save().catch(() => undefined)} disabled={!!busy}>
              {busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
            </Button>
            <Button type="button" onClick={() => setSendOpen(true)} disabled={!!busy}>
              {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send to customer
            </Button>
          </>
        )}
      </div>

      <SendDialog open={sendOpen} onOpenChange={setSendOpen} customer={customer} onConfirm={(channel) => save(channel)} title="Send estimate to customer" />
    </form>
  );
}
