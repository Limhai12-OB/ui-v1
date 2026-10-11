"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Info, Loader2 } from "lucide-react";
import type { Branch } from "@/types";
import { branchService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useAction } from "@/hooks/use-action";
import { today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormSection } from "@/components/forms/field";

function makeSchema(existingCodes: string[]) {
  return z.object({
    name: z.string().trim().min(2, "Enter a branch name").max(60, "Keep it under 60 characters"),
    code: z
      .string()
      .trim()
      .min(2, "Enter a short code, e.g. PP-TK")
      .max(10, "Use 10 characters or fewer")
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only")
      .refine((v) => !existingCodes.includes(v.toUpperCase()), "This code is already used by another branch"),
    address: z.string().trim().min(5, "Enter the street address").max(200),
    city: z.string().trim().min(2, "Enter the city or province").max(60),
    phone: z
      .string()
      .trim()
      .min(6, "Enter a phone number")
      .max(24, "Phone number is too long")
      .regex(/^\+?[\d\s()-]+$/, "Use digits, spaces and an optional leading +"),
    openedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the opening date")
      .refine((v) => v <= "2030-12-31", "Choose a realistic date"),
    status: z.enum(["active", "inactive"]),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function BranchFormPage({ id }: { id?: string }) {
  const branch = useAppStore((s) => (id ? s.branches.find((b) => b.id === id) : undefined));
  if (id && !branch) {
    return (
      <EmptyState
        icon={Building2}
        title="Branch not found"
        description="This branch doesn’t exist or was removed."
        action={
          <Button asChild>
            <Link href="/branches">Back to branches</Link>
          </Button>
        }
        className="min-h-[50vh]"
      />
    );
  }
  return <BranchForm key={branch?.id ?? "new"} branch={branch} />;
}

function BranchForm({ branch }: { branch?: Branch }) {
  const router = useRouter();
  const editing = !!branch;
  const branches = useAppStore((s) => s.branches);
  const [saved, setSaved] = useState(false);
  const [schema] = useState(() => makeSchema(branches.filter((b) => b.id !== branch?.id).map((b) => b.code.toUpperCase())));

  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: branch
      ? { name: branch.name, code: branch.code, address: branch.address, city: branch.city, phone: branch.phone, openedAt: branch.openedAt, status: branch.status }
      : { name: "", code: "", address: "", city: "Phnom Penh", phone: "", openedAt: today(), status: "active" },
  });
  const { errors, isDirty } = formState;

  const save = useAction(
    async (v: FormValues): Promise<string> => {
      const data = { ...v, code: v.code.trim().toUpperCase(), name: v.name.trim(), address: v.address.trim(), city: v.city.trim(), phone: v.phone.trim() };
      if (editing) {
        await branchService.update(branch!.id, branch!.isMain ? { ...data, status: "active" } : data);
        return branch!.id;
      }
      const created = await branchService.create(data);
      return created.id;
    },
    {
      success: editing ? "Branch updated" : "Branch created — a cash drawer account was added for it",
      onSuccess: (newId) => {
        setSaved(true);
        router.push(`/branches/${newId}`);
      },
    },
  );

  return (
    <>
      <UnsavedChangesGuard when={isDirty && !saved} />
      <PageHeader
        backHref={editing ? `/branches/${branch!.id}` : "/branches"}
        backLabel={editing ? branch!.name : "Branches"}
        title={editing ? `Edit ${branch!.name}` : "New branch"}
        description={editing ? "Update the branch’s details. Changes apply to every record for this branch." : "Add a shop location. You can invite a branch manager after creating it."}
      />
      <Card className="max-w-4xl gap-0 py-0">
        <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
          <div className="px-6">
            <FormSection title="Branch identity" description="How this branch appears in pickers, reports and the branch selector.">
              <Field label="Branch name" htmlFor="br-name" required error={errors.name?.message}>
                <Input id="br-name" autoFocus placeholder="e.g. Toul Kork" {...register("name")} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Branch code" htmlFor="br-code" required error={errors.code?.message} helper="Unique short code, e.g. PP-TK. Stored in uppercase.">
                <Input id="br-code" className="font-mono uppercase" placeholder="PP-XX" {...register("code")} aria-invalid={!!errors.code} />
              </Field>
            </FormSection>
            <FormSection title="Location & contact">
              <Field label="Street address" htmlFor="br-address" required error={errors.address?.message} className="sm:col-span-2">
                <Textarea id="br-address" rows={2} {...register("address")} aria-invalid={!!errors.address} />
              </Field>
              <Field label="City / province" htmlFor="br-city" required error={errors.city?.message}>
                <Input id="br-city" {...register("city")} aria-invalid={!!errors.city} />
              </Field>
              <Field label="Phone" htmlFor="br-phone" required error={errors.phone?.message}>
                <Input id="br-phone" type="tel" placeholder="+855 23 000 000" {...register("phone")} aria-invalid={!!errors.phone} />
              </Field>
            </FormSection>
            <FormSection title="Operations">
              <Field label="Opened on" htmlFor="br-opened" required error={errors.openedAt?.message}>
                <Input id="br-opened" type="date" className="tabular-nums" {...register("openedAt")} aria-invalid={!!errors.openedAt} />
              </Field>
              <Field
                label="Status"
                htmlFor="br-status"
                required
                helper={branch?.isMain ? "The main branch can’t be deactivated." : "Inactive branches are hidden from pickers for new records."}
              >
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={branch?.isMain}>
                      <SelectTrigger id="br-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              {!editing && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />A USD cash drawer account is created automatically, and every item starts with zero stock at this branch.
                </p>
              )}
            </FormSection>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            <Button asChild variant="outline">
              <Link href={editing ? `/branches/${branch!.id}` : "/branches"}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={save.pending || (editing && !isDirty)}>
              {save.pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Create branch"}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
