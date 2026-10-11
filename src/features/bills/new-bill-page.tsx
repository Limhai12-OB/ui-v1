"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Bill, Currency } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { billService } from "@/lib/api";
import { addDaysISO, daysBetween, formatDate, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Money } from "@/components/shared/money";
import { Field, FormSection, fieldDescribedBy } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { BranchSelect, CategorySelect, CurrencySelect } from "@/components/forms/entity-selects";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TERMS_PRESETS } from "./bill-utils";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const schema = z
  .object({
    supplier: z.string().trim().min(2, "Enter the supplier name").max(80, "Keep it under 80 characters"),
    branchId: z.string().min(1, "Select a branch"),
    categoryId: z.string().min(1, "Select an expense category"),
    issueDate: isoDate,
    dueDate: isoDate,
    currency: z.enum(["USD", "KHR"]),
    amount: z.union([z.number(), z.literal("")]),
    description: z.string().trim().min(2, "Describe what this bill is for").max(160, "Keep it under 160 characters"),
  })
  .superRefine((v, ctx) => {
    if (v.amount === "" || !Number.isFinite(v.amount) || v.amount <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount greater than zero" });
    } else if (v.currency === "KHR" && !Number.isInteger(v.amount)) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Riel amounts must be whole numbers" });
    } else if (v.currency === "USD" && Math.round(v.amount * 100) !== v.amount * 100) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Use at most 2 decimal places" });
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.issueDate) && /^\d{4}-\d{2}-\d{2}$/.test(v.dueDate) && v.dueDate < v.issueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date can't be before the bill date" });
    }
  });

type FormValues = z.infer<typeof schema>;

export function NewBillPage() {
  const router = useRouter();
  const bills = useAppStore((s) => s.bills);
  const { branch, branches, isOwner, user } = useScope();
  const [saved, setSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const defaultBranch = branch?.id ?? (!isOwner ? user.branchId : undefined) ?? (branches.length === 1 ? branches[0].id : "");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      supplier: "",
      branchId: defaultBranch ?? "",
      categoryId: "",
      issueDate: today(),
      dueDate: addDaysISO(today(), 30),
      currency: "USD",
      amount: "",
      description: "",
    },
  });
  const { register, control, handleSubmit, setValue, getValues, formState } = form;
  const { errors } = formState;
  const [issueDate, dueDate, currency, amount] = useWatch({ control, name: ["issueDate", "dueDate", "currency", "amount"] });

  // Supplier suggestions (most recent first) with their last-used category.
  const suppliers = useMemo(() => {
    const m = new Map<string, Bill>();
    for (const b of [...bills].sort((a, z2) => z2.issueDate.localeCompare(a.issueDate))) if (!m.has(b.supplier)) m.set(b.supplier, b);
    return m;
  }, [bills]);

  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(issueDate ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? "");
  const termDays = validDates ? daysBetween(issueDate, dueDate) : null;

  const save = useAction((v: FormValues & { draft: boolean }) => billService.create({ ...v, amount: Number(v.amount), currency: v.currency as Currency }), {
    success: (b) => (b.baseStatus === "draft" ? `Draft ${b.number} saved` : `Bill ${b.number} saved`),
    onSuccess: (b) => {
      setSaved(true);
      router.push(`/bills/${b.id}`);
    },
  });

  const submit = (draft: boolean) =>
    handleSubmit((v) => {
      setSavingDraft(draft);
      save.fire({ ...v, draft });
    });
  const disabled = !formState.isValid || save.pending || saved;

  const applyTerms = (n: number) => {
    const issue = getValues("issueDate");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) return;
    setValue("dueDate", addDaysISO(issue, n), { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <PageHeader title="New bill" description="Record a supplier bill so it's tracked in payables until it's paid." backHref="/bills" backLabel="Bills" />
      <form onSubmit={submit(false)} noValidate>
        <Card className="gap-0 px-6 py-0">
          <FormSection title="Supplier" description="Who issued the bill and which branch it belongs to.">
            <Field label="Supplier" htmlFor="bill-supplier" required error={errors.supplier?.message} helper="Start typing to pick an existing supplier." className="sm:col-span-2">
              <Input
                id="bill-supplier"
                list="bill-supplier-options"
                autoComplete="off"
                autoFocus
                placeholder="e.g. Mekong Beverage Distribution"
                aria-invalid={!!errors.supplier}
                aria-describedby={fieldDescribedBy("bill-supplier", !!errors.supplier)}
                {...register("supplier", {
                  onChange: (e) => {
                    const prev = suppliers.get(String(e.target.value));
                    if (prev && !getValues("categoryId")) setValue("categoryId", prev.categoryId, { shouldValidate: true, shouldDirty: true });
                  },
                })}
              />
              <datalist id="bill-supplier-options">
                {[...suppliers.keys()].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Branch" htmlFor="bill-branch" required error={errors.branchId?.message} helper={!isOwner ? "Bills are recorded for your branch." : undefined}>
              <Controller
                control={control}
                name="branchId"
                render={({ field }) => <BranchSelect id="bill-branch" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!errors.branchId} />}
              />
            </Field>
            <Field label="Category" htmlFor="bill-category" required error={errors.categoryId?.message}>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => <CategorySelect id="bill-category" kind="expense" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!errors.categoryId} />}
              />
            </Field>
          </FormSection>

          <FormSection title="Dates & terms" description="Payment terms set the due date from the bill date.">
            <Field label="Bill date" htmlFor="bill-issue" required error={errors.issueDate?.message}>
              <Input id="bill-issue" type="date" className="tabular-nums" aria-invalid={!!errors.issueDate} {...register("issueDate", { deps: ["dueDate"] })} />
            </Field>
            <Field
              label="Due date"
              htmlFor="bill-due"
              required
              error={errors.dueDate?.message}
              helper={termDays !== null && termDays >= 0 ? (termDays === 0 ? "Due on receipt" : `Net ${termDays} · due ${formatDate(dueDate)}`) : undefined}
            >
              <Input id="bill-due" type="date" min={issueDate} className="tabular-nums" aria-invalid={!!errors.dueDate} aria-describedby={fieldDescribedBy("bill-due", !!errors.dueDate)} {...register("dueDate")} />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-[13px] font-medium" id="bill-terms-label">
                Payment terms
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="bill-terms-label">
                {TERMS_PRESETS.map((n) => {
                  const active = termDays === n;
                  return (
                    <Button key={n} type="button" size="sm" variant="outline" aria-pressed={active} className={cn(active && "border-primary bg-primary-light text-primary")} onClick={() => applyTerms(n)}>
                      Net {n}
                    </Button>
                  );
                })}
              </div>
            </div>
          </FormSection>

          <FormSection title="Amount" description="Bills keep their own currency. Riel amounts are whole numbers.">
            <Field label="Currency" htmlFor="bill-currency" required>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <CurrencySelect
                    id="bill-currency"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      // Re-check amount precision for the new currency.
                      void form.trigger("amount");
                    }}
                  />
                )}
              />
            </Field>
            <Field label="Amount" htmlFor="bill-amount" required error={errors.amount?.message}>
              <Controller
                control={control}
                name="amount"
                render={({ field }) => (
                  <MoneyInput
                    id="bill-amount"
                    currency={currency as Currency}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={currency === "KHR" ? "0" : "0.00"}
                    aria-invalid={!!errors.amount}
                  />
                )}
              />
            </Field>
            <Field label="Description" htmlFor="bill-desc" required error={errors.description?.message} className="sm:col-span-2">
              <Textarea id="bill-desc" rows={3} placeholder="e.g. Beverage consignment – October" aria-invalid={!!errors.description} {...register("description")} />
            </Field>
          </FormSection>
        </Card>

        <div className="sticky bottom-0 mt-6 flex flex-col-reverse gap-3 border-t bg-background/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {typeof amount === "number" && amount > 0 ? (
              <>
                Total <Money amount={amount} currency={currency as Currency} className="font-medium text-foreground" />
                {validDates && termDays !== null && termDays >= 0 && <> · due {formatDate(dueDate)}</>}
              </>
            ) : (
              "Drafts aren't payable until approved."
            )}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button asChild variant="ghost" disabled={save.pending}>
              <Link href="/bills">Cancel</Link>
            </Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={submit(true)}>
              {save.pending && savingDraft && <Loader2 className="animate-spin" />}
              Save as draft
            </Button>
            <Button type="submit" disabled={disabled}>
              {save.pending && !savingDraft && <Loader2 className="animate-spin" />}
              Save bill
            </Button>
          </div>
        </div>
      </form>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
    </>
  );
}
