"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Invoice, PaymentMethod } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { invoiceService } from "@/lib/api";
import { invoiceTotals } from "@/lib/domain";
import { formatMoney } from "@/lib/currency";
import { today } from "@/lib/date";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { AccountSelect } from "@/components/forms/entity-selects";
import { PAYMENT_METHODS } from "@/features/sales-shared/lines";

const methods = PAYMENT_METHODS.map((m) => m.value) as [PaymentMethod, ...PaymentMethod[]];

function makeSchema(balance: number, issueDate: string, currency: Invoice["currency"]) {
  return z.object({
    amount: z
      .number({ error: "Enter the amount received" })
      .positive("Amount must be more than 0")
      .max(balance + 0.0001, `Can't exceed the balance due of ${formatMoney(balance, currency)}`)
      .refine((v) => currency !== "KHR" || Number.isInteger(v), "Riel amounts must be whole numbers"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the payment date")
      .refine((d) => d >= issueDate, "Payment can't be before the invoice issue date")
      .refine((d) => d <= today(), "Payment date can't be in the future"),
    method: z.enum(methods),
    accountId: z.string().min(1, "Select the account that received the money"),
    reference: z.string().trim().max(60).optional(),
  });
}
type Values = z.infer<ReturnType<typeof makeSchema>>;

/** Pick a sensible default account for the method: cash drawer for cash, bank/e-wallet otherwise. */
function defaultAccount(accounts: ReturnType<typeof useAppStore.getState>["accounts"], inv: Invoice, method: PaymentMethod) {
  const pool = accounts.filter((a) => a.status === "active" && a.branchId === inv.branchId && a.currency === inv.currency);
  const preferred = method === "cash" ? pool.find((a) => a.type === "cash") : method === "wing" ? (pool.find((a) => a.provider === "Wing") ?? pool.find((a) => a.type !== "cash")) : pool.find((a) => a.type !== "cash");
  return (preferred ?? pool[0])?.id ?? "";
}

export function RecordPaymentDialog({ invoice, open, onOpenChange }: { invoice: Invoice; open: boolean; onOpenChange: (o: boolean) => void }) {
  const accounts = useAppStore((s) => s.accounts);
  const { inScope } = useScope();
  const { branchName } = useLookups();
  const { balance } = invoiceTotals(invoice);
  const schema = useMemo(() => makeSchema(balance, invoice.issueDate, invoice.currency), [balance, invoice.issueDate, invoice.currency]);
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onChange" });
  const { control, register, handleSubmit, reset, setValue, watch, formState } = form;
  const amount = watch("amount");
  const hasAccounts = accounts.some((a) => a.status === "active" && a.branchId === invoice.branchId && a.currency === invoice.currency && inScope(a.branchId));

  useEffect(() => {
    if (open) reset({ amount: balance, date: today(), method: "bank_transfer", accountId: defaultAccount(accounts, invoice, "bank_transfer"), reference: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const record = useAction((v: Values) => invoiceService.recordPayment(invoice.id, { ...v, reference: v.reference || undefined }), {
    success: (p) => `Payment of ${formatMoney(p.amount, invoice.currency)} recorded`,
    errorTitle: "Payment not recorded",
    onSuccess: () => onOpenChange(false),
  });

  const remaining = Number.isFinite(amount) ? Math.max(0, balance - amount) : balance;

  return (
    <Dialog open={open} onOpenChange={(o) => !record.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit((v) => record.fire(v))} noValidate>
          <DialogHeader>
            <DialogTitle>Record payment · {invoice.number}</DialogTitle>
            <DialogDescription>
              Balance due {formatMoney(balance, invoice.currency)}. The payment posts an income transaction to the selected {invoice.currency} account and updates the customer&apos;s balance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <Field
              label="Amount received"
              htmlFor="pay-amount"
              required
              error={formState.errors.amount?.message}
              helper={Number.isFinite(amount) && amount > 0 && amount < balance ? `Partial payment — ${formatMoney(remaining, invoice.currency)} will remain due.` : "Full balance. Lower it to record a partial payment."}
              className="sm:col-span-2"
            >
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput id="pay-amount" ref={field.ref} currency={invoice.currency} value={Number.isFinite(field.value) ? field.value : ""} onValueChange={(v) => field.onChange(v === "" ? Number.NaN : v)} onBlur={field.onBlur} aria-invalid={!!formState.errors.amount} />
                )}
              />
            </Field>
            <Field label="Payment date" htmlFor="pay-date" required error={formState.errors.date?.message}>
              <Input id="pay-date" type="date" className="tabular-nums" max={today()} {...register("date")} aria-invalid={!!formState.errors.date} />
            </Field>
            <Field label="Method" htmlFor="pay-method" required>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(m) => {
                      field.onChange(m);
                      const acc = defaultAccount(accounts, invoice, m as PaymentMethod);
                      if (acc) setValue("accountId", acc, { shouldValidate: true });
                    }}
                  >
                    <SelectTrigger id="pay-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label="Deposit to account"
              htmlFor="pay-account"
              required
              error={formState.errors.accountId?.message}
              helper={`Only ${invoice.currency} accounts at ${branchName(invoice.branchId)} are listed — the account must match the invoice currency.`}
              className="sm:col-span-2"
            >
              <Controller control={control} name="accountId" render={({ field }) => <AccountSelect id="pay-account" value={field.value || undefined} onChange={field.onChange} currency={invoice.currency} branchId={invoice.branchId} aria-invalid={!!formState.errors.accountId} />} />
            </Field>
            {!hasAccounts && (
              <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-text sm:col-span-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {branchName(invoice.branchId)} has no active {invoice.currency} account. Add one in Accounts before recording this payment.
              </p>
            )}
            <Field label="Reference" htmlFor="pay-ref" helper="Bank transaction ID, KHQR reference or receipt number (optional)." className="sm:col-span-2">
              <Input id="pay-ref" {...register("reference")} placeholder="e.g. TRF8812034" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={record.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={record.pending || !hasAccounts}>
              {record.pending && <Loader2 className="animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
