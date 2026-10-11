"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { FinancialAccount } from "@/types";
import { accountService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { useScope } from "@/hooks/use-scope";
import { today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field, FormSection, fieldDescribedBy } from "@/components/forms/field";
import { BranchSelect, CurrencySelect } from "@/components/forms/entity-selects";
import { MoneyInput } from "@/components/forms/money-input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROVIDERS: Record<FinancialAccount["type"], FinancialAccount["provider"][]> = {
  bank: ["ABA", "ACLEDA"],
  ewallet: ["Wing", "ABA"],
  cash: ["Cash"],
};

const schema = z
  .object({
    name: z.string().trim().min(3, "Enter at least 3 characters").max(60, "Keep it under 60 characters"),
    type: z.enum(["bank", "ewallet", "cash"]),
    provider: z.enum(["ABA", "Wing", "ACLEDA", "Cash"]),
    last4: z.string().trim(),
    currency: z.enum(["USD", "KHR"]),
    branchId: z.string().min(1, "Choose a branch"),
    openingBalance: z.union([z.number(), z.literal("")]),
    openingDate: z.string().min(1, "Choose the opening date"),
  })
  .superRefine((v, ctx) => {
    if (!PROVIDERS[v.type].includes(v.provider)) ctx.addIssue({ code: "custom", path: ["provider"], message: "This provider doesn't offer that account type" });
    if (v.type === "cash") {
      if (!v.last4) ctx.addIssue({ code: "custom", path: ["last4"], message: "Enter a drawer label, e.g. Till 2" });
    } else if (!/^\d{4}$/.test(v.last4)) ctx.addIssue({ code: "custom", path: ["last4"], message: "Enter the last 4 digits of the account number" });
    if (v.openingBalance === "") ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "Enter the opening balance (0 if new)" });
    else if (v.openingBalance < 0) ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "Opening balance can't be negative" });
    else if (v.currency === "KHR" && !Number.isInteger(v.openingBalance)) ctx.addIssue({ code: "custom", path: ["openingBalance"], message: "KHR amounts must be whole riel" });
    if (v.openingDate > today()) ctx.addIssue({ code: "custom", path: ["openingDate"], message: "Opening date can't be in the future" });
  });
type Values = z.infer<typeof schema>;

export function AccountForm() {
  const router = useRouter();
  const { branch, branches } = useScope();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", type: "bank", provider: "ABA", last4: "", currency: "USD", branchId: branch?.id ?? branches[0]?.id ?? "", openingBalance: "", openingDate: today() },
  });
  const { register, control, handleSubmit, formState, setValue, getValues } = form;
  const type = useWatch({ control, name: "type" });
  const currency = useWatch({ control, name: "currency" });
  const e = formState.errors;

  useEffect(() => {
    if (!PROVIDERS[type].includes(getValues("provider"))) setValue("provider", PROVIDERS[type][0], { shouldValidate: formState.isSubmitted });
  }, [type, getValues, setValue, formState.isSubmitted]);

  const create = useAction(
    (v: Values) =>
      accountService.create({
        name: v.name.trim(),
        type: v.type,
        provider: v.provider,
        accountNumber: v.type === "cash" ? v.last4.trim() : `•••• ${v.last4}`,
        currency: v.currency,
        branchId: v.branchId,
        openingBalance: Number(v.openingBalance),
        openingDate: v.openingDate,
      }),
    {
      success: (a) => `${a.name} created`,
      onSuccess: (a) => {
        setSaved(true);
        router.push(`/accounts/${a.id}`);
      },
    },
  );

  return (
    <>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
      <PageHeader title="New financial account" description="Add a bank account, e-wallet or cash drawer. Its balance is calculated from the opening balance plus every transaction." backHref="/accounts" backLabel="Accounts" />
      <Card className="px-6 py-0">
        <form onSubmit={handleSubmit((v) => create.fire(v))} noValidate>
          <FormSection title="Account" description="How the account appears across LedgerVision.">
            <Field label="Account name" htmlFor="acc-name" required error={e.name?.message} className="sm:col-span-2">
              <Input id="acc-name" placeholder="e.g. ABA Business USD – Sen Sok" {...register("name")} aria-invalid={!!e.name} aria-describedby={fieldDescribedBy("acc-name", !!e.name)} />
            </Field>
            <Field label="Type" htmlFor="acc-type" required>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="acc-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank account</SelectItem>
                      <SelectItem value="ewallet">E-wallet</SelectItem>
                      <SelectItem value="cash">Cash drawer</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Provider" htmlFor="acc-provider" required error={e.provider?.message}>
              <Controller
                control={control}
                name="provider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="acc-provider" className="w-full" aria-invalid={!!e.provider}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS[type].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p === "Cash" ? "Cash (physical drawer)" : p === "ABA" ? "ABA Bank" : p === "ACLEDA" ? "ACLEDA Bank" : "Wing"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label={type === "cash" ? "Drawer label" : "Account number (last 4 digits)"}
              htmlFor="acc-last4"
              required
              error={e.last4?.message}
              helper={type === "cash" ? "Shown instead of an account number." : "Only the last 4 digits are stored and shown masked, e.g. •••• 4821."}
            >
              <Input
                id="acc-last4"
                inputMode={type === "cash" ? "text" : "numeric"}
                maxLength={type === "cash" ? 20 : 4}
                placeholder={type === "cash" ? "Till 2" : "4821"}
                className="tabular-nums"
                {...register("last4")}
                aria-invalid={!!e.last4}
                aria-describedby={fieldDescribedBy("acc-last4", !!e.last4)}
              />
            </Field>
            <Field label="Currency" htmlFor="acc-currency" required helper="An account holds one currency. Amounts are never converted on posting.">
              <Controller control={control} name="currency" render={({ field }) => <CurrencySelect id="acc-currency" value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field label="Branch" htmlFor="acc-branch" required error={e.branchId?.message}>
              <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="acc-branch" value={field.value} onChange={field.onChange} aria-invalid={!!e.branchId} />} />
            </Field>
          </FormSection>
          <FormSection title="Opening balance" description="The balance on the day you start tracking this account in LedgerVision.">
            <Field label={`Opening balance (${currency})`} htmlFor="acc-open" required error={e.openingBalance?.message}>
              <Controller
                control={control}
                name="openingBalance"
                render={({ field }) => <MoneyInput id="acc-open" currency={currency} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!e.openingBalance} />}
              />
            </Field>
            <Field label="Opening date" htmlFor="acc-date" required error={e.openingDate?.message}>
              <Input id="acc-date" type="date" max={today()} {...register("openingDate")} aria-invalid={!!e.openingDate} />
            </Field>
          </FormSection>
          <div className="flex justify-end gap-2 border-t py-4">
            <Button type="button" variant="outline" onClick={() => router.push("/accounts")} disabled={create.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.pending}>
              {create.pending && <Loader2 className="animate-spin" />} Create account
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
