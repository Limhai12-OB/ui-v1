"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Info, Loader2 } from "lucide-react";
import type { Currency, TransactionType } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { transactionService } from "@/lib/api";
import { accountBalance } from "@/lib/domain";
import { formatMoney, roundMoney } from "@/lib/currency";
import { formatDate, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field, FormSection } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { AccountSelect, BranchSelect, CategorySelect } from "@/components/forms/entity-selects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TYPE_LABEL } from "./meta";

const TYPES: { value: TransactionType; label: string; icon: typeof ArrowDownLeft; hint: string }[] = [
  { value: "income", label: "Income", icon: ArrowDownLeft, hint: "Money received" },
  { value: "expense", label: "Expense", icon: ArrowUpRight, hint: "Money paid out" },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight, hint: "Between your accounts" },
];

const baseSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  date: z
    .string()
    .min(1, "Choose a date")
    .refine((d) => d <= today(), "The date can't be in the future"),
  branchId: z.string().min(1, "Choose a branch"),
  accountId: z.string().min(1, "Choose an account"),
  toAccountId: z.string().optional(),
  amount: z.union([z.number(), z.literal("")]).refine((v) => typeof v === "number" && v > 0, "Enter an amount greater than zero"),
  categoryId: z.string().optional(),
  description: z.string().trim().min(2, "Describe the transaction (at least 2 characters)").max(120, "Keep it under 120 characters"),
  counterparty: z.string().trim().max(80, "Keep it under 80 characters").optional(),
  reference: z.string().trim().max(40, "Keep it under 40 characters").optional(),
});
type FormValues = z.infer<typeof baseSchema>;

function parseType(v: string | null): TransactionType {
  return v === "income" || v === "transfer" ? v : "expense";
}

export function TransactionForm() {
  const params = useSearchParams();
  const router = useRouter();
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const { branch, branches, user } = useScope();
  const lk = useLookups();
  const [saved, setSaved] = useState(false);
  const addAnotherRef = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const defaultBranch = branch?.id ?? (branches.length === 1 ? branches[0].id : (user.branchId ?? branches.find((b) => b.isMain)?.id ?? branches[0]?.id ?? ""));
  const initialType = parseType(params.get("type"));

  const schema = useMemo(
    () =>
      baseSchema.superRefine((v, ctx) => {
        const acc = accounts.find((a) => a.id === v.accountId);
        if (acc && typeof v.amount === "number") {
          if (acc.currency === "KHR" && !Number.isInteger(v.amount)) ctx.addIssue({ code: "custom", path: ["amount"], message: "Riel amounts must be whole numbers" });
          if (acc.currency === "USD" && Math.round(v.amount * 100) !== v.amount * 100) ctx.addIssue({ code: "custom", path: ["amount"], message: "Use at most 2 decimal places" });
        }
        if (v.type === "transfer") {
          if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the account receiving the money" });
          else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose two different accounts" });
          else {
            const to = accounts.find((a) => a.id === v.toAccountId);
            if (acc && to && to.currency !== acc.currency) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Transfers must be between accounts in the same currency" });
          }
        } else if (!v.categoryId) {
          ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
        }
      }),
    [accounts],
  );

  const blank = (type: TransactionType, keep?: Partial<FormValues>): FormValues => ({
    type,
    date: today(),
    branchId: defaultBranch,
    accountId: "",
    toAccountId: "",
    amount: "",
    categoryId: "",
    description: "",
    counterparty: "",
    reference: "",
    ...keep,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: blank(initialType) });
  const { register, handleSubmit, control, setValue, reset, formState, trigger } = form;
  const { errors } = formState;
  const [type, branchId, accountId, toAccountId, amount, date] = useWatch({ control, name: ["type", "branchId", "accountId", "toAccountId", "amount", "date"] });

  const account = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const currency: Currency = account?.currency ?? "USD";

  // Keep dependent fields consistent when the branch or source account changes.
  useEffect(() => {
    if (account && account.branchId !== branchId) setValue("accountId", "", { shouldValidate: formState.isSubmitted });
  }, [branchId, account, setValue, formState.isSubmitted]);
  useEffect(() => {
    if (toAccount && account && (toAccount.currency !== account.currency || toAccount.id === account.id)) setValue("toAccountId", "", { shouldValidate: true });
  }, [account, toAccount, setValue]);

  const setType = (t: TransactionType) => {
    if (t === type) return;
    setValue("type", t, { shouldDirty: true });
    setValue("categoryId", "", { shouldDirty: true });
    if (t !== "transfer") setValue("toAccountId", "");
    void trigger();
  };

  const save = useAction(
    async (v: FormValues) => {
      const acc = accounts.find((a) => a.id === v.accountId)!;
      return transactionService.create({
        type: v.type,
        date: v.date,
        amount: Number(v.amount),
        currency: acc.currency,
        accountId: v.accountId,
        toAccountId: v.type === "transfer" ? v.toAccountId : undefined,
        categoryId: v.type === "transfer" ? undefined : v.categoryId || undefined,
        branchId: v.branchId,
        description: v.description.trim(),
        counterparty: v.counterparty?.trim() || undefined,
        reference: v.reference?.trim() || undefined,
        source: "manual",
      });
    },
    {
      success: (tx) => `${TYPE_LABEL[tx.type]} of ${formatMoney(tx.amount, tx.currency)} saved`,
      onSuccess: (tx) => {
        if (addAnotherRef.current) {
          reset(blank(tx.type, { date: tx.date, branchId: tx.branchId, accountId: tx.accountId }));
          setTimeout(() => amountRef.current?.focus(), 0);
        } else {
          setSaved(true);
          router.push(`/transactions/${tx.id}`);
        }
      },
    },
  );

  const submit = (addAnother: boolean) => {
    addAnotherRef.current = addAnother;
    void handleSubmit((v) => save.fire(v))();
  };

  const before = account ? accountBalance(account, transactions) : null;
  const amt = typeof amount === "number" && amount > 0 ? amount : 0;
  const delta = type === "income" ? amt : -amt;
  const meta = TYPES.find((t) => t.value === type)!;

  return (
    <>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
      <PageHeader
        title={type === "transfer" ? "New transfer" : type === "income" ? "Add income" : "Add expense"}
        description="Record a manual transaction. It posts to the ledger immediately and updates account balances."
        backHref="/transactions"
        backLabel="Transactions"
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <Card className="gap-0 px-6 py-0">
          <section className="border-b py-6">
            <p id="tx-type-label" className="mb-2 text-[13px] font-medium">
              Transaction type
            </p>
            <div role="radiogroup" aria-labelledby="tx-type-label" className="grid gap-2 sm:grid-cols-3">
              {TYPES.map((t) => {
                const active = t.value === type;
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      active ? "border-primary bg-primary-light/60" : "hover:bg-muted",
                    )}
                  >
                    <span className={cn("flex size-8 items-center justify-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <FormSection title="Amount & account" description={type === "transfer" ? "Move money between two of your accounts." : "Which account the money moved through."}>
            <Field label="Date" htmlFor="tx-date" required error={errors.date?.message}>
              <Input id="tx-date" type="date" max={today()} {...register("date")} aria-invalid={!!errors.date} />
            </Field>
            <Field label="Branch" htmlFor="tx-branch" required error={errors.branchId?.message} helper={branches.length === 1 ? "You can record transactions for your branch only." : undefined}>
              <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="tx-branch" value={field.value} onChange={field.onChange} aria-invalid={!!errors.branchId} />} />
            </Field>
            <Field label={type === "transfer" ? "From account" : "Account"} htmlFor="tx-account" required error={errors.accountId?.message} helper={account ? `Amounts are recorded in ${account.currency}, the account's currency.` : "The currency follows the account you choose."}>
              <Controller
                control={control}
                name="accountId"
                render={({ field }) => <AccountSelect id="tx-account" value={field.value || undefined} onChange={field.onChange} branchId={branchId || undefined} aria-invalid={!!errors.accountId} />}
              />
            </Field>
            <Field label="Amount" htmlFor="tx-amount" required error={errors.amount?.message}>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput
                    id="tx-amount"
                    ref={amountRef}
                    currency={currency}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={currency === "USD" ? "0.00" : "0"}
                    aria-invalid={!!errors.amount}
                  />
                )}
              />
            </Field>
            {type === "transfer" && (
              <Field
                label="To account"
                htmlFor="tx-to"
                required
                className="sm:col-span-2"
                error={errors.toAccountId?.message}
                helper={
                  account
                    ? `Only ${account.currency} accounts are listed — a transfer moves the same amount in the same currency. To exchange USD and KHR, record an expense and an income instead.`
                    : "Choose the from account first."
                }
              >
                <Controller
                  control={control}
                  name="toAccountId"
                  render={({ field }) => (
                    <AccountSelect
                      id="tx-to"
                      value={field.value || undefined}
                      onChange={field.onChange}
                      currency={account?.currency}
                      excludeId={accountId || undefined}
                      disabled={!account}
                      placeholder={account ? "Select destination account" : "Choose the from account first"}
                      aria-invalid={!!errors.toAccountId}
                    />
                  )}
                />
              </Field>
            )}
          </FormSection>

          <FormSection title="Details" description="Helps you find and report on this transaction later.">
            {type !== "transfer" && (
              <Field label="Category" htmlFor="tx-category" required error={errors.categoryId?.message} className="sm:col-span-2">
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <CategorySelect
                      id="tx-category"
                      key={type}
                      kind={type === "income" ? "income" : "expense"}
                      value={field.value || undefined}
                      onChange={field.onChange}
                      placeholder={type === "income" ? "Select income category" : "Select expense category"}
                      aria-invalid={!!errors.categoryId}
                    />
                  )}
                />
              </Field>
            )}
            <Field label="Description" htmlFor="tx-desc" required error={errors.description?.message} className="sm:col-span-2">
              <Input id="tx-desc" placeholder={type === "income" ? "e.g. Catering order deposit" : type === "expense" ? "e.g. Generator diesel" : "e.g. Cash deposit to bank"} {...register("description")} aria-invalid={!!errors.description} />
            </Field>
            <Field label={type === "income" ? "Received from" : type === "expense" ? "Paid to" : "Counterparty"} htmlFor="tx-cp" error={errors.counterparty?.message} helper="Optional">
              <Input id="tx-cp" {...register("counterparty")} aria-invalid={!!errors.counterparty} />
            </Field>
            <Field label="Reference" htmlFor="tx-ref" error={errors.reference?.message} helper="Optional — receipt, invoice or bank reference">
              <Input id="tx-ref" {...register("reference")} aria-invalid={!!errors.reference} />
            </Field>
          </FormSection>

          <div className="flex flex-col-reverse gap-2 border-t py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" asChild>
              <Link href="/transactions">Cancel</Link>
            </Button>
            <Button type="button" variant="secondary" disabled={!formState.isValid || save.pending} onClick={() => submit(true)}>
              {save.pending && addAnotherRef.current && <Loader2 className="animate-spin" />}
              Save and add another
            </Button>
            <Button type="submit" disabled={!formState.isValid || save.pending}>
              {save.pending && !addAnotherRef.current && <Loader2 className="animate-spin" />}
              Save {meta.label.toLowerCase()}
            </Button>
          </div>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">{meta.hint}</p>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    type === "income" && amt > 0 && "text-success-text",
                    type === "expense" && amt > 0 && "text-error-text",
                  )}
                >
                  {type === "income" && amt > 0 ? "+" : type === "expense" && amt > 0 ? "−" : ""}
                  {formatMoney(amt, currency)}
                </p>
                <p className="text-xs text-muted-foreground">{date ? formatDate(date) : "—"}</p>
              </div>
              {account && before !== null ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="truncate text-muted-foreground">{account.name}</dt>
                    <dd className="tabular-nums">
                      {formatMoney(before, account.currency)}
                      <ArrowRight className="mx-1 inline size-3 text-muted-foreground" aria-label="becomes" />
                      <span className="font-medium">{formatMoney(roundMoney(before + delta, account.currency), account.currency)}</span>
                    </dd>
                  </div>
                  {type === "transfer" && toAccount && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="truncate text-muted-foreground">{toAccount.name}</dt>
                      <dd className="tabular-nums">
                        {(() => {
                          const b = accountBalance(toAccount, transactions);
                          return (
                            <>
                              {formatMoney(b, toAccount.currency)}
                              <ArrowRight className="mx-1 inline size-3 text-muted-foreground" aria-label="becomes" />
                              <span className="font-medium">{formatMoney(roundMoney(b + amt, toAccount.currency), toAccount.currency)}</span>
                            </>
                          );
                        })()}
                      </dd>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Current balance → balance after saving · {lk.branchName(account.branchId)}</p>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Choose an account to see the effect on its balance.</p>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>Manual transactions can be deleted until they are reconciled against a bank statement.</p>
          </div>
        </aside>
      </form>
    </>
  );
}
