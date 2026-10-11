"use client";

import { useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2, PackageMinus, Save, Send } from "lucide-react";
import type { Currency, ID } from "@/types";
import { useAppStore, type NewInvoice } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { documentTotals } from "@/lib/domain";
import { Field } from "@/components/forms/field";
import { BranchSelect, CurrencySelect, CustomerSelect } from "@/components/forms/entity-selects";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LineItemsEditor } from "@/features/sales-shared/line-items-editor";
import { discountSchema, emptyLine, linesArraySchema, refineLines, stockShortfalls, toLineItems, VAT_RATE, type LinesForm } from "@/features/sales-shared/lines";

export const invoiceSchema = z
  .object({
    customerId: z.string().min(1, "Select a customer"),
    branchId: z.string().min(1, "Select a branch"),
    currency: z.enum(["USD", "KHR"]),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an issue date"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a due date"),
    lines: linesArraySchema,
    discount: discountSchema,
    taxEnabled: z.boolean(),
    notes: z.string().max(500, "Keep notes under 500 characters").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate && v.issueDate && v.dueDate < v.issueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date can't be before the issue date" });
    refineLines(v, ctx);
  });
export type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export function invoiceDefaults(opts: { customerId?: ID; branchId?: ID; terms?: number; currency?: Currency } = {}): InvoiceFormValues {
  const issue = today();
  return {
    customerId: opts.customerId ?? "",
    branchId: opts.branchId ?? "",
    currency: opts.currency ?? "USD",
    issueDate: issue,
    dueDate: addDaysISO(issue, opts.terms ?? 15),
    lines: [emptyLine()],
    discount: 0,
    taxEnabled: true,
    notes: "",
  };
}

export function toNewInvoice(v: InvoiceFormValues, extra: Partial<NewInvoice> = {}): NewInvoice {
  return {
    customerId: v.customerId,
    branchId: v.branchId,
    currency: v.currency,
    issueDate: v.issueDate,
    dueDate: v.dueDate,
    lines: toLineItems(v.lines),
    discount: v.discount,
    taxRate: v.taxEnabled ? VAT_RATE : 0,
    notes: v.notes?.trim() || undefined,
    ...extra,
  };
}

interface InvoiceFormProps {
  defaultValues: InvoiceFormValues;
  /** Persist; `send` = create/save and send (deducts stock). Throw to keep the form open. */
  onSubmit: (values: InvoiceFormValues, send: boolean) => Promise<unknown>;
  onCancel: () => void;
  draftLabel?: string;
  sendLabel?: string;
  /** Content rendered above the line items (e.g. voice extraction warnings). */
  beforeLines?: React.ReactNode;
  /** Start dirty (e.g. extracted from voice) so the unsaved guard is active. */
  startDirty?: boolean;
}

export function InvoiceForm({ defaultValues, onSubmit, onCancel, draftLabel = "Save draft", sendLabel = "Create & send", beforeLines, startDirty }: InvoiceFormProps) {
  const form = useForm<InvoiceFormValues>({ resolver: zodResolver(invoiceSchema), mode: "onTouched", defaultValues });
  const { control, register, handleSubmit, setValue, getValues, formState } = form;
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  const { branches } = useScope();
  const { branchName } = useLookups();
  const dueTouched = useRef(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [confirmValues, setConfirmValues] = useState<InvoiceFormValues | null>(null);

  const customerId = useWatch({ control, name: "customerId" });
  const branchId = useWatch({ control, name: "branchId" });
  const customer = customers.find((c) => c.id === customerId);
  const e = formState.errors;

  const applyTerms = (issue: string, terms: number | undefined) => {
    if (dueTouched.current || !issue || terms === undefined) return;
    setValue("dueDate", addDaysISO(issue, terms), { shouldDirty: true, shouldValidate: formState.isSubmitted });
  };

  const save = async (values: InvoiceFormValues, send: boolean) => {
    setBusy(send ? "send" : "draft");
    try {
      setSaved(true);
      await onSubmit(values, send);
    } catch (err) {
      setSaved(false);
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const confirmShortfalls = useMemo(() => (confirmValues ? stockShortfalls(confirmValues.lines, items, confirmValues.branchId) : []), [confirmValues, items]);
  const confirmTotals = confirmValues ? documentTotals(toLineItems(confirmValues.lines), confirmValues.discount, confirmValues.taxEnabled ? VAT_RATE : 0, confirmValues.currency) : null;
  const stockLines = confirmValues?.lines.filter((l) => l.itemId) ?? [];

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => save(v, false).catch(() => undefined))}
      className="space-y-6 pb-4"
    >
      <UnsavedChangesGuard when={(formState.isDirty || !!startDirty) && !saved} />

      <Card className="gap-0 p-0">
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Customer" htmlFor="inv-customer" required error={e.customerId?.message} className="sm:col-span-2 lg:col-span-1">
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <CustomerSelect
                  id="inv-customer"
                  type="wholesale"
                  value={field.value || undefined}
                  aria-invalid={!!e.customerId}
                  onChange={(id) => {
                    field.onChange(id);
                    const c = customers.find((x) => x.id === id);
                    if (c && branches.some((b) => b.id === c.branchId)) setValue("branchId", c.branchId, { shouldDirty: true, shouldValidate: true });
                    applyTerms(getValues("issueDate"), c?.paymentTermsDays);
                  }}
                />
              )}
            />
          </Field>
          <Field label="Branch" htmlFor="inv-branch" required error={e.branchId?.message} helper={customer && branchId && customer.branchId !== branchId ? `${customer.name} is normally served by ${branchName(customer.branchId)}.` : "Stock ships from this branch."}>
            <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="inv-branch" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!e.branchId} />} />
          </Field>
          <Field label="Currency" htmlFor="inv-currency" required helper="An invoice has a single currency. Payments must go to an account in this currency.">
            <Controller control={control} name="currency" render={({ field }) => <CurrencySelect id="inv-currency" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field label="Issue date" htmlFor="inv-issue" required error={e.issueDate?.message}>
            <Input
              id="inv-issue"
              type="date"
              className="tabular-nums"
              {...register("issueDate", { onChange: (ev) => applyTerms(ev.target.value, customer?.paymentTermsDays) })}
              aria-invalid={!!e.issueDate}
            />
          </Field>
          <Field
            label="Due date"
            htmlFor="inv-due"
            required
            error={e.dueDate?.message}
            helper={customer ? `${customer.paymentTermsDays}-day terms for ${customer.name}. You can change it.` : "Set automatically from the customer's payment terms."}
          >
            <Input id="inv-due" type="date" className="tabular-nums" {...register("dueDate", { onChange: () => (dueTouched.current = true) })} aria-invalid={!!e.dueDate} />
          </Field>
        </div>
      </Card>

      {beforeLines}

      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-base font-medium">Line items</h2>
          <p className="text-xs text-muted-foreground">Pick stock items to track inventory, or type a free-text line for services and delivery fees.</p>
        </div>
        <LineItemsEditor form={form as unknown as UseFormReturn<LinesForm>} stockHint="Sending the invoice will deduct stock from this branch — restock or reduce quantities first." />
      </Card>

      <Card className="p-5">
        <Field label="Notes" htmlFor="inv-notes" error={e.notes?.message} helper="Shown on the invoice (delivery instructions, bank details…).">
          <Textarea id="inv-notes" rows={3} {...register("notes")} />
        </Field>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PackageMinus className="size-3.5 shrink-0" aria-hidden />
          Drafts don&apos;t affect stock. Sending deducts stock-item quantities from the branch.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={!!busy}>
            Cancel
          </Button>
          <Button type="submit" variant="outline" disabled={!!busy}>
            {busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />}
            {draftLabel}
          </Button>
          <Button type="button" disabled={!!busy} onClick={handleSubmit((v) => setConfirmValues(v))}>
            {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />}
            {sendLabel}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmValues}
        onOpenChange={(o) => !o && setConfirmValues(null)}
        title={confirmShortfalls.length ? "Not enough stock to send" : "Send this invoice?"}
        confirmLabel={confirmShortfalls.length ? "Back to editing" : sendLabel}
        description={
          confirmShortfalls.length
            ? `The invoice can be saved as a draft, but it can't be sent until ${branchName(confirmValues?.branchId)} has enough stock.`
            : `The invoice becomes payable and is due ${formatDate(confirmValues?.dueDate)}.${stockLines.length ? ` ${stockLines.length} stock ${stockLines.length === 1 ? "line" : "lines"} will be deducted from ${branchName(confirmValues?.branchId)}.` : ""}`
        }
        onConfirm={async () => {
          if (!confirmValues || confirmShortfalls.length) return;
          await save(confirmValues, true);
        }}
      >
        {confirmValues && confirmTotals && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            {confirmShortfalls.length > 0 ? (
              <ul className="space-y-1 text-warning-text">
                {confirmShortfalls.map((s) => (
                  <li key={s.item.id} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {s.item.name}: {s.requested} requested, {s.available} available
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {stockLines.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {stockLines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{l.description}</span>
                        <span className="tabular-nums">−{l.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-between border-t pt-2 font-medium">
                  <span>Invoice total</span>
                  <Money amount={confirmTotals.total} currency={confirmValues.currency} />
                </div>
              </>
            )}
          </div>
        )}
      </ConfirmDialog>
    </form>
  );
}
