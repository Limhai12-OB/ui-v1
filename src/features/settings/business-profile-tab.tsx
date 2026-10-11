"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Loader2, Lock, Trash2 } from "lucide-react";
import { businessService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useCan } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { formatDate } from "@/lib/date";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormSection } from "@/components/forms/field";
import { DetailList } from "@/components/shared/detail-list";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";

const COUNTRIES = ["Cambodia", "Thailand", "Vietnam", "Lao PDR"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MAX_LOGO_BYTES = 1024 * 1024;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(100, "Keep it under 100 characters"),
  email: z.string().trim().min(1, "Enter a business email").email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(6, "Enter a phone number")
    .max(24, "Phone number is too long")
    .regex(/^\+?[\d\s()-]+$/, "Use digits, spaces and an optional leading +"),
  address: z.string().trim().min(5, "Enter the business address").max(240),
  country: z.string().min(1),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  logoDataUrl: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function BusinessProfileTab() {
  const business = useAppStore((s) => s.business);
  const canEdit = useCan("business.settings");

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Business profile
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Lock className="size-3" aria-hidden /> Read-only
            </span>
          </CardTitle>
          <CardDescription>Only the Business Owner can change the business profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {business.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logoDataUrl} alt={`${business.name} logo`} className="size-16 rounded-lg border object-contain" />
          )}
          <DetailList
            items={[
              { label: "Business name", value: business.name },
              { label: "Business email", value: business.email },
              { label: "Phone", value: business.phone },
              { label: "Country", value: business.country },
              { label: "Address", value: business.address, className: "sm:col-span-2" },
              { label: "Fiscal year starts", value: MONTHS[business.fiscalYearStartMonth - 1] },
              { label: "On LedgerVision since", value: formatDate(business.createdAt) },
            ]}
          />
        </CardContent>
      </Card>
    );
  }
  return <BusinessProfileForm />;
}

function BusinessProfileForm() {
  const business = useAppStore((s) => s.business);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const toValues = (): FormValues => ({
    name: business.name,
    email: business.email,
    phone: business.phone,
    address: business.address,
    country: business.country,
    fiscalYearStartMonth: business.fiscalYearStartMonth,
    logoDataUrl: business.logoDataUrl,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: toValues() });
  const { register, control, handleSubmit, reset, setValue, formState } = form;
  const { errors, isDirty, isValid } = formState;
  const logo = useWatch({ control, name: "logoDataUrl" });

  // Re-sync when business data changes elsewhere (e.g. demo reset) and the form is pristine.
  useEffect(() => {
    if (!form.formState.isDirty) reset(toValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  const save = useAction(
    async (v: FormValues): Promise<void> => {
      await businessService.update({ ...v, name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), address: v.address.trim() });
    },
    { success: "Business profile saved", onSuccess: () => reset(undefined, { keepValues: true }) },
  );

  const onLogo = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) return setLogoError("Use a PNG, JPG, SVG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("The logo must be 1 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setValue("logoDataUrl", String(reader.result), { shouldDirty: true });
    reader.onerror = () => setLogoError("We couldn’t read that file. Try another image.");
    reader.readAsDataURL(file);
  };

  return (
    <Card className="gap-0 py-0">
      <UnsavedChangesGuard when={isDirty && !save.pending} />
      <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
        <div className="px-6">
          <FormSection title="Identity" description="Shown on invoices, planned purchases and monthly reports.">
            <Field label="Business name" htmlFor="bp-name" required error={errors.name?.message} className="sm:col-span-2">
              <Input id="bp-name" {...register("name")} aria-invalid={!!errors.name} />
            </Field>
            <Field label="Business email" htmlFor="bp-email" required error={errors.email?.message}>
              <Input id="bp-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
            </Field>
            <Field label="Phone" htmlFor="bp-phone" required error={errors.phone?.message}>
              <Input id="bp-phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
            </Field>
            <div className="space-y-2 sm:col-span-2">
              <span className="text-[13px] font-medium" id="bp-logo-label">
                Logo
              </span>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="Logo preview" className="size-full object-contain" />
                  ) : (
                    <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    aria-labelledby="bp-logo-label"
                    onChange={(e) => {
                      onLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <ImagePlus /> {logo ? "Replace" : "Upload logo"}
                  </Button>
                  {logo && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue("logoDataUrl", undefined, { shouldDirty: true })}>
                      <Trash2 /> Remove
                    </Button>
                  )}
                </div>
              </div>
              {logoError ? (
                <p role="alert" className="text-xs text-destructive">
                  {logoError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP, up to 1 MB.</p>
              )}
            </div>
          </FormSection>
          <FormSection title="Location" description="Your registered business address. Branch addresses are managed in Branches.">
            <Field label="Address" htmlFor="bp-address" required error={errors.address?.message} className="sm:col-span-2">
              <Textarea id="bp-address" rows={2} {...register("address")} aria-invalid={!!errors.address} />
            </Field>
            <Field label="Country" htmlFor="bp-country" required>
              <Controller
                control={control}
                name="country"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="bp-country" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </FormSection>
          <FormSection title="Accounting" description="Used for year-to-date figures in reports.">
            <Field label="Fiscal year starts in" htmlFor="bp-fy" required>
              <Controller
                control={control}
                name="fiscalYearStartMonth"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger id="bp-fy" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </FormSection>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-6 py-4">
          {isDirty && <span className="mr-auto text-xs text-muted-foreground">You have unsaved changes</span>}
          <Button type="button" variant="outline" disabled={!isDirty || save.pending} onClick={() => reset(toValues())}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || !isValid || save.pending}>
            {save.pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
