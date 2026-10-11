"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Check, ImagePlus, Loader2, MapPin, Store, Trash2, UserPlus } from "lucide-react";
import { businessService, branchService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useSessionStore } from "@/store/session-store";
import { useUIStore } from "@/store/ui-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatNumber } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { Steps } from "@/components/shared/steps";
import { DemoNotice } from "@/components/shared/demo-notice";
import { DetailList } from "@/components/shared/detail-list";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { cn } from "@/lib/utils";
import { AuthHeader, AuthIcon, AuthNarrow, AuthSkeleton } from "./auth-ui";

export const COUNTRIES = ["Cambodia", "Thailand", "Vietnam", "Lao PDR"];
const MAX_LOGO_BYTES = 1024 * 1024;

const rateSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+(\.\d+)?$/.test(v) && Number(v) >= 1000 && Number(v) <= 10000), "Enter a rate between 1,000 and 10,000 KHR per USD, or leave it empty");

const schema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(100, "Keep it under 100 characters"),
  email: z.string().trim().min(1, "Enter a business email").email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(6, "Enter a phone number")
    .max(24, "Phone number is too long")
    .regex(/^\+?[\d\s()-]+$/, "Use digits, spaces and an optional leading +"),
  address: z.string().trim().min(5, "Enter the street address").max(200, "Keep it under 200 characters"),
  city: z.string().trim().min(2, "Enter the city or province").max(60),
  country: z.string().min(1, "Select a country"),
  currency: z.enum(["USD", "KHR"]),
  logoDataUrl: z.string().optional(),
  rate: rateSchema,
});
type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: "business", label: "Business" },
  { id: "location", label: "Location" },
  { id: "preferences", label: "Preferences" },
  { id: "review", label: "Review" },
];
const STEP_FIELDS: (keyof FormValues)[][] = [["name", "email", "phone"], ["address", "city", "country"], ["currency", "rate", "logoDataUrl"], []];

export function BusinessSetupPage() {
  const hydrated = useHydrated();
  const pendingOwner = useSessionStore((s) => s.pendingOwner);
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.userId);
  const users = useAppStore((s) => s.users);
  const isOwner = users.find((u) => u.id === userId)?.role === "owner";

  if (!hydrated) return <AuthSkeleton fields={3} />;
  if (!pendingOwner && !(status === "signed_in" && isOwner)) {
    return (
      <AuthNarrow>
        <AuthHeader
          icon={<AuthIcon tone="warning"><UserPlus /></AuthIcon>}
          title="Create an account first"
          description="Business setup starts after you create and verify a Business Owner account."
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </AuthNarrow>
    );
  }
  return <BusinessSetupWizard ownerName={pendingOwner?.name} ownerEmail={pendingOwner?.email} />;
}

function BusinessSetupWizard({ ownerName, ownerEmail }: { ownerName?: string; ownerEmail?: string }) {
  const router = useRouter();
  const business = useAppStore((s) => s.business);
  const mainBranch = useAppStore((s) => s.branches.find((b) => b.isMain));
  const completeOnboarding = useSessionStore((s) => s.completeOnboarding);
  const setDisplayCurrency = useUIStore((s) => s.setDisplayCurrency);
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isNew = !!ownerEmail;

  const defaults = useMemo<FormValues>(
    () =>
      isNew
        ? { name: "", email: ownerEmail ?? "", phone: "", address: "", city: "Phnom Penh", country: "Cambodia", currency: "USD", logoDataUrl: undefined, rate: business.khrPerUsd ? String(business.khrPerUsd) : "" }
        : {
            name: business.name,
            email: business.email,
            phone: business.phone,
            address: stripCity(business.address, mainBranch?.city ?? "Phnom Penh"),
            city: mainBranch?.city ?? "Phnom Penh",
            country: business.country,
            currency: business.defaultCurrency,
            logoDataUrl: business.logoDataUrl,
            rate: business.khrPerUsd ? String(business.khrPerUsd) : "",
          },
    // Defaults are captured once when the wizard opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: defaults });
  const { register, control, trigger, setValue, getValues, formState } = form;
  const { errors } = formState;
  const values = useWatch({ control }) as FormValues;

  const goTo = (i: number) => {
    setStep(i);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (ok) goTo(step + 1);
  };

  const onLogo = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) return setLogoError("Use a PNG, JPG, SVG or WebP image.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("The logo must be 1 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setValue("logoDataUrl", String(reader.result), { shouldDirty: true });
    reader.onerror = () => setLogoError("We couldn't read that file. Try another image.");
    reader.readAsDataURL(file);
  };

  const finish = async () => {
    const ok = await trigger();
    if (!ok) {
      const firstBad = STEP_FIELDS.findIndex((f) => f.some((k) => form.getFieldState(k).invalid));
      if (firstBad >= 0) goTo(firstBad);
      return;
    }
    const v = getValues();
    setFinishing(true);
    try {
      const rate = v.rate.trim() === "" ? null : Number(v.rate);
      const fullAddress = [v.address.trim(), v.city.trim()].filter(Boolean).join(", ");
      await businessService.update({
        name: v.name.trim(),
        email: v.email.trim(),
        phone: v.phone.trim(),
        address: fullAddress,
        country: v.country,
        defaultCurrency: v.currency,
        logoDataUrl: v.logoDataUrl,
        ...(rate !== business.khrPerUsd ? { khrPerUsd: rate } : {}),
      });
      if (mainBranch) await branchService.update(mainBranch.id, { address: v.address.trim(), city: v.city.trim() });
      setDisplayCurrency(v.currency);
      setFinished(true);
      completeOnboarding();
      toast.success("Your business is set up", { description: `${v.name.trim()} is ready. ${mainBranch?.name ?? "Main Branch"} is your first branch.` });
      router.replace("/dashboard");
    } catch (e) {
      toast.error("Setup failed", { description: e instanceof Error ? e.message : "Try again." });
      setFinishing(false);
    }
  };

  const rateNum = values.rate && !errors.rate && values.rate.trim() !== "" ? Number(values.rate) : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <UnsavedChangesGuard when={formState.isDirty && !finished} message="Your business setup isn't finished. Leave and discard what you've entered?" />
      <p className="mb-1 text-xs font-medium tracking-wide text-primary uppercase">Business setup</p>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        {ownerName ? `Welcome, ${ownerName.split(" ")[0]}. Let's set up your business.` : "Set up your business"}
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">This takes about two minutes. You can change everything later in Settings.</p>
      <Steps steps={STEPS} current={step} className="mb-6" />

      <Card className="gap-0 p-5 sm:p-6">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length - 1) next();
            else finish();
          }}
        >
          {step === 0 && (
            <fieldset className="grid gap-4">
              <legend className="mb-4 flex items-center gap-2 text-base font-medium">
                <Building2 className="size-4 text-primary" aria-hidden /> About your business
              </legend>
              <Field label="Business name" htmlFor="bs-name" required error={errors.name?.message} helper="As it appears on invoices and reports.">
                <Input id="bs-name" autoFocus placeholder="e.g. Angkor Fresh Mart Co., Ltd." {...register("name")} aria-invalid={!!errors.name} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business email" htmlFor="bs-email" required error={errors.email?.message}>
                  <Input id="bs-email" type="email" autoComplete="email" {...register("email")} aria-invalid={!!errors.email} />
                </Field>
                <Field label="Phone" htmlFor="bs-phone" required error={errors.phone?.message}>
                  <Input id="bs-phone" type="tel" autoComplete="tel" placeholder="+855 23 000 000" {...register("phone")} aria-invalid={!!errors.phone} />
                </Field>
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="grid gap-4">
              <legend className="mb-4 flex items-center gap-2 text-base font-medium">
                <MapPin className="size-4 text-primary" aria-hidden /> Where you operate
              </legend>
              <Field label="Street address" htmlFor="bs-address" required error={errors.address?.message}>
                <Textarea id="bs-address" rows={2} autoFocus placeholder="No. 45, Street 278, Sangkat Boeng Keng Kang I" {...register("address")} aria-invalid={!!errors.address} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="City / province" htmlFor="bs-city" required error={errors.city?.message}>
                  <Input id="bs-city" {...register("city")} aria-invalid={!!errors.city} />
                </Field>
                <Field label="Country" htmlFor="bs-country" required error={errors.country?.message}>
                  <Controller
                    control={control}
                    name="country"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="bs-country" className="w-full">
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
              </div>
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                <Store className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p className="text-xs text-muted-foreground">
                  This address is also used for your first branch, <span className="font-medium text-foreground">Main Branch</span>. You can add more branches after setup.
                </p>
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="grid gap-5">
              <legend className="mb-4 text-base font-medium">Preferences</legend>
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label className="text-[13px] font-medium" id="bs-currency-label">
                      Default display currency
                    </Label>
                    <RadioGroup value={field.value} onValueChange={field.onChange} aria-labelledby="bs-currency-label" className="grid-cols-2">
                      {(
                        [
                          ["USD", "US Dollar", "$1,250.00"],
                          ["KHR", "Cambodian Riel", "៛5,125,000"],
                        ] as const
                      ).map(([code, label, example]) => (
                        <Label
                          key={code}
                          htmlFor={`cur-${code}`}
                          className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50", field.value === code && "border-primary bg-primary-light/40")}
                        >
                          <RadioGroupItem id={`cur-${code}`} value={code} className="mt-0.5" />
                          <span>
                            <span className="block text-sm font-medium">
                              {code} · {label}
                            </span>
                            <span className="block text-xs text-muted-foreground tabular-nums">{example}</span>
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">Totals and dashboards are shown in this currency. Each record keeps its own currency.</p>
                  </div>
                )}
              />
              <Field
                label="KHR per 1 USD (optional)"
                htmlFor="bs-rate"
                error={errors.rate?.message}
                helper={rateNum ? `1 USD = ${formatNumber(rateNum)} KHR. Used only to show combined totals — you can change or remove it in Settings.` : "Leave empty to keep USD and KHR amounts separate. LedgerVision never converts without a rate you set."}
              >
                <Input id="bs-rate" inputMode="decimal" placeholder="e.g. 4100" className="tabular-nums" {...register("rate")} aria-invalid={!!errors.rate} />
              </Field>
              <div className="space-y-2">
                <span className="text-[13px] font-medium" id="bs-logo-label">
                  Business logo (optional)
                </span>
                <div className="flex items-center gap-4">
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {values.logoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={values.logoDataUrl} alt="Logo preview" className="size-full object-contain" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-labelledby="bs-logo-label" onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = ""; }} />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                      <ImagePlus /> {values.logoDataUrl ? "Replace" : "Upload logo"}
                    </Button>
                    {values.logoDataUrl && (
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
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP, up to 1 MB. Stored in your browser for the demo.</p>
                )}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <h2 className="text-base font-medium">Review and finish</h2>
              <ReviewSection title="Business" onEdit={() => goTo(0)}>
                <DetailList
                  items={[
                    { label: "Name", value: values.name },
                    { label: "Email", value: values.email },
                    { label: "Phone", value: values.phone },
                  ]}
                />
              </ReviewSection>
              <ReviewSection title="Location" onEdit={() => goTo(1)}>
                <DetailList
                  items={[
                    { label: "Address", value: values.address, className: "sm:col-span-2" },
                    { label: "City / province", value: values.city },
                    { label: "Country", value: values.country },
                  ]}
                />
              </ReviewSection>
              <ReviewSection title="Preferences" onEdit={() => goTo(2)}>
                <DetailList
                  items={[
                    { label: "Display currency", value: values.currency },
                    { label: "Conversion rate", value: rateNum ? <span className="tabular-nums">1 USD = {formatNumber(rateNum)} KHR</span> : "Not set — currencies kept separate" },
                    { label: "Logo", value: values.logoDataUrl ? "Uploaded" : "None" },
                  ]}
                />
              </ReviewSection>
              <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary-light/40 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Store className="size-4" aria-hidden />
                </span>
                <div className="text-sm">
                  <p className="font-medium">Your first branch: Main Branch</p>
                  <p className="text-xs text-muted-foreground">
                    Established at {values.address || "your business address"}
                    {values.city ? `, ${values.city}` : ""}. Add more branches and invite branch managers from the Branches page.
                  </p>
                </div>
              </div>
              <DemoNotice>Demo: your profile is applied to the sample dataset (Angkor Fresh Mart). You’ll continue as the demo Business Owner account with its sample branches and records.</DemoNotice>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2 border-t pt-5">
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0 || finishing} className={cn(step === 0 && "invisible")}>
              <ArrowLeft /> Back
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
              Step {step + 1} of {STEPS.length}
            </span>
            {step < STEPS.length - 1 ? (
              <Button type="submit">
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button type="submit" disabled={finishing}>
                {finishing ? <Loader2 className="animate-spin" /> : <Check />}
                {finishing ? "Setting up…" : "Finish setup"}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

function stripCity(address: string, city: string): string {
  const suffix = `, ${city}`;
  return address.endsWith(suffix) ? address.slice(0, -suffix.length) : address;
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}
