"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Customer } from "@/types";
import { ApiError, customerService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { Field, FormSection } from "@/components/forms/field";
import { BranchSelect } from "@/components/forms/entity-selects";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";

const PHONE_RE = /^(\+855|0)\d{8,9}$/;
const normalizePhone = (p: string) => p.replace(/[\s()-]/g, "");

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(80, "Keep it under 80 characters"),
  type: z.enum(["wholesale", "walk_in"]),
  contactName: z.string().trim().max(60).optional(),
  phone: z.string().trim().min(1, "Enter a phone number").refine((v) => PHONE_RE.test(normalizePhone(v)), "Use a Cambodian number, e.g. +855 12 345 678 or 012 345 678"),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]).optional(),
  address: z.string().trim().max(160).optional(),
  telegram: z.union([z.literal(""), z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/, "Telegram usernames are 5–32 letters, numbers or underscores")]).optional(),
  branchId: z.string().min(1, "Select the branch that serves this customer"),
  paymentTermsDays: z.number({ error: "Enter payment terms in days" }).int("Use whole days").min(0, "Can't be negative").max(120, "Maximum 120 days"),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional(),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;

/** Pretty-print a Cambodian number as +855 xx xxx xxx(x). */
export function formatPhone(raw: string): string {
  let p = normalizePhone(raw);
  if (p.startsWith("0")) p = `+855${p.slice(1)}`;
  const m = /^\+855(\d{2})(\d{3})(\d{3,4})$/.exec(p);
  return m ? `+855 ${m[1]} ${m[2]} ${m[3]}` : raw.trim();
}

function toPayload(v: CustomerFormValues): Omit<Customer, "id" | "createdAt"> {
  const telegram = v.telegram?.trim();
  return {
    name: v.name.trim(),
    type: v.type,
    contactName: v.contactName?.trim() || undefined,
    phone: formatPhone(v.phone),
    email: v.email?.trim() || undefined,
    address: v.address?.trim() || undefined,
    telegram: telegram ? (telegram.startsWith("@") ? telegram : `@${telegram}`) : undefined,
    branchId: v.branchId,
    paymentTermsDays: v.type === "walk_in" ? 0 : v.paymentTermsDays,
    notes: v.notes?.trim() || undefined,
  };
}

function defaults(c: Customer | undefined, branchId: string): CustomerFormValues {
  return {
    name: c?.name ?? "",
    type: c?.type ?? "wholesale",
    contactName: c?.contactName ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    telegram: c?.telegram ?? "",
    branchId: c?.branchId ?? branchId,
    paymentTermsDays: c?.paymentTermsDays ?? 15,
    notes: c?.notes ?? "",
  };
}

interface CustomerFormProps {
  customer?: Customer;
  onSaved: (c: Customer) => void;
  onCancel: () => void;
  /** Long page layout (sections) vs compact dialog layout. */
  layout?: "page" | "dialog";
  guard?: boolean;
}

/** Create/edit customer. Duplicate phone numbers are rejected by the service. */
export function CustomerForm({ customer, onSaved, onCancel, layout = "page", guard = true }: CustomerFormProps) {
  const { branch, branches } = useScope();
  const defaultBranch = branch?.id ?? branches.find((b) => b.isMain)?.id ?? branches[0]?.id ?? "";
  const form = useForm<CustomerFormValues>({ resolver: zodResolver(customerSchema), mode: "onTouched", defaultValues: defaults(customer, defaultBranch) });
  const { register, handleSubmit, control, formState, setError, watch, reset } = form;
  const type = watch("type");
  const editing = !!customer;
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    reset(defaults(customer, defaultBranch));
  }, [customer, defaultBranch, reset]);

  const submit = async (v: CustomerFormValues) => {
    const payload = toPayload(v);
    try {
      if (customer) {
        const dup = useAppStore.getState().customers.some((x) => x.id !== customer.id && normalizePhone(x.phone) === normalizePhone(payload.phone));
        if (dup) throw new ApiError("A customer with this phone number already exists.", 409, "DUPLICATE");
        await customerService.update(customer.id, payload);
        setSaved(true);
        toast.success("Customer updated");
        onSaved({ ...customer, ...payload });
      } else {
        const created = await customerService.create(payload);
        setSaved(true);
        toast.success(`${created.name} added`);
        onSaved(created);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save the customer.";
      if (/phone/i.test(msg)) setError("phone", { message: msg }, { shouldFocus: true });
      else setError("root", { message: msg });
      toast.error("Couldn't save customer", { description: msg });
    }
  };

  const e = formState.errors;
  const fields = {
    identity: (
      <>
        <Field label="Customer name" htmlFor="cus-name" required error={e.name?.message} className="sm:col-span-2">
          <Input id="cus-name" autoFocus={!editing} {...register("name")} aria-invalid={!!e.name} placeholder="e.g. Riverside Bistro" />
        </Field>
        <Field label="Customer type" required className="sm:col-span-2">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2">
                {[
                  { v: "wholesale", t: "Wholesale", d: "Buys on invoice with payment terms" },
                  { v: "walk_in", t: "Walk-in regular", d: "Pays at the counter; tracked for loyalty" },
                ].map((o) => (
                  <Label key={o.v} htmlFor={`cus-type-${o.v}`} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-light/40">
                    <RadioGroupItem id={`cus-type-${o.v}`} value={o.v} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{o.t}</span>
                      <span className="block text-xs text-muted-foreground">{o.d}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
        </Field>
        <Field label="Contact person" htmlFor="cus-contact" error={e.contactName?.message}>
          <Input id="cus-contact" {...register("contactName")} placeholder="e.g. Mr. Sokun Meas" />
        </Field>
        <Field label="Branch" htmlFor="cus-branch" required error={e.branchId?.message} helper="The branch that serves and invoices this customer.">
          <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="cus-branch" value={field.value} onChange={field.onChange} aria-invalid={!!e.branchId} />} />
        </Field>
      </>
    ),
    contact: (
      <>
        <Field label="Phone" htmlFor="cus-phone" required error={e.phone?.message} helper="Cambodian format: +855 12 345 678">
          <Input id="cus-phone" type="tel" inputMode="tel" autoComplete="tel" {...register("phone")} aria-invalid={!!e.phone} placeholder="+855 12 345 678" />
        </Field>
        <Field label="Email" htmlFor="cus-email" error={e.email?.message}>
          <Input id="cus-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!e.email} placeholder="orders@example.com" />
        </Field>
        <Field label="Telegram handle" htmlFor="cus-telegram" error={e.telegram?.message} helper="Used when sending planned purchases (simulated in the demo).">
          <Input id="cus-telegram" {...register("telegram")} aria-invalid={!!e.telegram} placeholder="@username" />
        </Field>
        <Field label="Address" htmlFor="cus-address" error={e.address?.message}>
          <Input id="cus-address" {...register("address")} placeholder="Street, district, city" />
        </Field>
      </>
    ),
    terms: (
      <>
        <Field
          label="Payment terms (days)"
          htmlFor="cus-terms"
          required
          error={e.paymentTermsDays?.message}
          helper={type === "walk_in" ? "Walk-in regulars pay immediately (0 days)." : "Invoice due dates default to the issue date plus these days."}
        >
          <Input id="cus-terms" type="number" min={0} max={120} className="tabular-nums" disabled={type === "walk_in"} {...register("paymentTermsDays", { valueAsNumber: true })} aria-invalid={!!e.paymentTermsDays} />
        </Field>
        <Field label="Notes" htmlFor="cus-notes" error={e.notes?.message} className="sm:col-span-2">
          <Textarea id="cus-notes" rows={3} {...register("notes")} placeholder="Delivery instructions, loyalty card number…" />
        </Field>
      </>
    ),
  };

  const actions = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={formState.isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" disabled={formState.isSubmitting || (editing && !formState.isDirty)}>
        {formState.isSubmitting && <Loader2 className="animate-spin" />}
        {editing ? "Save changes" : "Create customer"}
      </Button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      {guard && <UnsavedChangesGuard when={formState.isDirty && !saved} />}
      {e.root?.message && (
        <p role="alert" className="mb-4 rounded-lg bg-error-light px-3 py-2 text-sm text-error-text">
          {e.root.message}
        </p>
      )}
      {layout === "page" ? (
        <>
          <FormSection title="Customer" description="Who they are and which branch serves them.">{fields.identity}</FormSection>
          <FormSection title="Contact details" description="Phone numbers must be unique across customers.">{fields.contact}</FormSection>
          <FormSection title="Terms & notes">{fields.terms}</FormSection>
          <div className="pt-4">{actions}</div>
        </>
      ) : (
        <>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-0.5 py-2 sm:grid-cols-2">
            {fields.identity}
            {fields.contact}
            {fields.terms}
          </div>
          <div className="pt-4">{actions}</div>
        </>
      )}
    </form>
  );
}
