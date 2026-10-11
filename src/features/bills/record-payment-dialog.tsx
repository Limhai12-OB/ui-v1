"use client";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Bill, PaymentMethod } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { billService } from "@/lib/api";
import { billTotals } from "@/lib/domain";
import { formatDate, today } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { Money } from "@/components/shared/money";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, fieldDescribedBy } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { AccountSelect } from "@/components/forms/entity-selects";
import { BILL_PAYMENT_METHODS } from "./bill-utils";

const METHODS = BILL_PAYMENT_METHODS.map((m) => m.value) as [
  PaymentMethod,
  ...PaymentMethod[],
];

function makeSchema(bill: Bill, balance: number) {
  return z
    .object({
      amount: z.union([z.number(), z.literal("")]),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
      method: z.enum(METHODS),
      accountId: z.string().min(1, "Select the account the payment came from"),
      reference: z
        .string()
        .trim()
        .max(60, "Keep it under 60 characters")
        .optional(),
      note: z
        .string()
        .trim()
        .max(200, "Keep it under 200 characters")
        .optional(),
    })
    .superRefine((v, ctx) => {
      if (v.amount === "" || !Number.isFinite(v.amount) || v.amount <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Enter an amount greater than zero",
        });
      else if (v.amount > balance + 0.0001)
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: `Can't exceed the balance of ${formatMoney(balance, bill.currency)}`,
        });
      else if (bill.currency === "KHR" && !Number.isInteger(v.amount))
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Riel amounts must be whole numbers",
        });
      else if (
        bill.currency === "USD" &&
        Math.abs(Math.round(v.amount * 100) - v.amount * 100) > 1e-6
      )
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Use at most 2 decimal places",
        });
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
        if (v.date < bill.issueDate)
          ctx.addIssue({
            code: "custom",
            path: ["date"],
            message: `Can't be before the bill date (${formatDate(bill.issueDate)})`,
          });
        else if (v.date > today())
          ctx.addIssue({
            code: "custom",
            path: ["date"],
            message: "Payment date can't be in the future",
          });
      }
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function RecordPaymentDialog({
  bill,
  open,
  onOpenChange,
}: {
  bill: Bill;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so defaults and limits reflect the latest balance. */}
        {open && <PaymentForm bill={bill} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const accounts = useAppStore((s) => s.accounts);
  const { inScope } = useScope();
  const { balance, paid, total } = billTotals(bill);

  // Prefer accounts of the bill's branch; fall back to any in-scope account in the bill currency.
  const { branchFilter, options } = useMemo(() => {
    const sameCurrency = accounts.filter(
      (a) =>
        a.status === "active" &&
        inScope(a.branchId) &&
        a.currency === bill.currency,
    );
    const sameBranch = sameCurrency.filter((a) => a.branchId === bill.branchId);
    return sameBranch.length > 0
      ? { branchFilter: bill.branchId, options: sameBranch }
      : { branchFilter: undefined, options: sameCurrency };
  }, [accounts, inScope, bill.currency, bill.branchId]);

  const schema = useMemo(() => makeSchema(bill, balance), [bill, balance]);
  const defaults = useMemo<FormValues>(
    () => ({
      amount: balance,
      date: today() < bill.issueDate ? bill.issueDate : today(),
      method: "bank_transfer",
      accountId: options[0]?.id ?? "",
      reference: "",
      note: "",
    }),
    [balance, bill.issueDate, options],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: defaults,
  });
  const { register, control, handleSubmit, formState, watch } = form;
  const { errors } = formState;

  const amount = watch("amount");
  const remaining =
    typeof amount === "number" && amount > 0
      ? Math.max(0, balance - amount)
      : balance;

  const save = useAction(
    (v: FormValues) =>
      billService.recordPayment(bill.id, {
        amount: Number(v.amount),
        date: v.date,
        method: v.method,
        accountId: v.accountId,
        reference: v.reference || undefined,
        note: v.note || undefined,
      }),
    {
      success: (p) =>
        `Payment of ${formatMoney(p.amount, bill.currency)} recorded`,
      onSuccess: () => onDone(),
    },
  );

  return (
    <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          {bill.number} · {bill.supplier}. Recording a payment also posts an
          expense transaction from the selected account.
        </DialogDescription>
      </DialogHeader>

      <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Bill total</dt>
          <dd className="font-medium">
            <Money amount={total} currency={bill.currency} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Paid</dt>
          <dd className="font-medium">
            <Money amount={paid} currency={bill.currency} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Balance</dt>
          <dd className="font-semibold">
            <Money amount={balance} currency={bill.currency} />
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 py-4 sm:grid-cols-2">
        <Field
          label="Amount"
          htmlFor="pay-amount"
          required
          error={errors.amount?.message}
          helper={
            remaining > 0
              ? `Partial payment · ${formatMoney(remaining, bill.currency)} will remain`
              : "Pays the bill in full"
          }
        >
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <MoneyInput
                id="pay-amount"
                currency={bill.currency}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                max={balance}
                aria-invalid={!!errors.amount}
                aria-describedby={fieldDescribedBy(
                  "pay-amount",
                  !!errors.amount,
                )}
              />
            )}
          />
        </Field>
        <Field
          label="Payment date"
          htmlFor="pay-date"
          required
          error={errors.date?.message}
        >
          <Input
            id="pay-date"
            type="date"
            min={bill.issueDate}
            max={today()}
            className="tabular-nums"
            aria-invalid={!!errors.date}
            {...register("date")}
          />
        </Field>
        <Field label="Method" htmlFor="pay-method" required>
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILL_PAYMENT_METHODS.map((m) => (
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
          label="Paid from account"
          htmlFor="pay-account"
          required
          error={
            errors.accountId?.message ??
            (options.length === 0
              ? `No active ${bill.currency} account in your current branch scope.`
              : undefined)
          }
          helper={
            !branchFilter
              ? `No ${bill.currency} account at this bill's branch — showing other ${bill.currency} accounts.`
              : `${bill.currency} accounts only`
          }
        >
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <AccountSelect
                id="pay-account"
                value={field.value || undefined}
                onChange={field.onChange}
                currency={bill.currency}
                branchId={branchFilter}
                aria-invalid={!!errors.accountId}
              />
            )}
          />
        </Field>
        <Field
          label="Reference"
          htmlFor="pay-ref"
          error={errors.reference?.message}
          helper="Optional — e.g. bank transaction ID."
        >
          <Input
            id="pay-ref"
            placeholder={bill.number}
            {...register("reference")}
          />
        </Field>
        <Field
          label="Note"
          htmlFor="pay-note"
          error={errors.note?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="pay-note"
            rows={2}
            placeholder="Optional"
            {...register("note")}
          />
        </Field>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!formState.isValid || save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          Record payment
        </Button>
      </DialogFooter>
    </form>
  );
}
