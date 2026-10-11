"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Info, Loader2, Lock, Trash2 } from "lucide-react";
import type { Currency, Language } from "@/types";
import { businessService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useUIStore } from "@/store/ui-store";
import { useCan } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { formatDateTime } from "@/lib/date";
import { formatMoney, formatNumber } from "@/lib/currency";
import { LANGUAGES } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/forms/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "USD", label: "US Dollar ($)" },
  { code: "KHR", label: "Cambodian Riel (៛)" },
];

function parseRate(v: string): { value: number | null; error: string | null } {
  const t = v.trim().replace(/,/g, "");
  if (!t) return { value: null, error: "Enter a rate" };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { value: null, error: "Use numbers only, e.g. 4100" };
  const n = Number(t);
  if (n < 1000 || n > 10000) return { value: null, error: "Enter a rate between 1,000 and 10,000 KHR" };
  return { value: n, error: null };
}

export function CurrencyTab() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-6">
        <RateCard />
        <ConversionRuleCard />
      </div>
      <div className="grid content-start gap-6">
        <DisplayCurrencyCard />
        <LanguageCard />
      </div>
    </div>
  );
}

function RateCard() {
  const business = useAppStore((s) => s.business);
  const canEdit = useCan("business.settings");
  const current = business.khrPerUsd;
  const [input, setInput] = useState(current ? String(current) : "");
  const [touched, setTouched] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setInput(current ? String(current) : "");
    setTouched(false);
  }, [current]);

  const parsed = parseRate(input);
  const changed = parsed.value !== null && parsed.value !== current;
  const showError = touched && input.trim() !== "" && parsed.error;

  const save = useAction((rate: number) => businessService.update({ khrPerUsd: rate }), { success: "Conversion rate saved" });
  const remove = useAction(() => businessService.update({ khrPerUsd: null }), { success: "Conversion rate removed — amounts will no longer be converted" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          KHR conversion rate
          {current ? (
            <Badge variant="success">
              <ArrowRightLeft /> Active
            </Badge>
          ) : (
            <Badge variant="neutral">Not configured</Badge>
          )}
        </CardTitle>
        <CardDescription>The rate LedgerVision uses to show USD and KHR amounts together in one display currency.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Current rate</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{current ? `1 USD = ${formatNumber(current)} KHR` : "None"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{current ? `Last updated ${formatDateTime(business.khrRateUpdatedAt)}` : business.khrRateUpdatedAt ? `Removed ${formatDateTime(business.khrRateUpdatedAt)}` : "No rate has been set yet."}</p>
        </div>

        {canEdit ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (changed && parsed.value) save.fire(parsed.value);
            }}
            className="space-y-3"
          >
            <Field label="KHR per 1 USD" htmlFor="rate" error={showError || undefined} helper={parsed.value ? `Example: ${formatMoney(100000, "KHR")} ≈ ${formatMoney(100000 / parsed.value, "USD")}` : "Enter the rate you use for your books, e.g. 4100."}>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>1 USD =</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="rate" inputMode="decimal" className="tabular-nums" value={input} onChange={(e) => setInput(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!showError} />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>KHR</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!changed || save.pending}>
                {save.pending && <Loader2 className="animate-spin" />}
                Save rate
              </Button>
              {current !== null && (
                <Button type="button" variant="destructive" onClick={() => setConfirmRemove(true)} disabled={remove.pending}>
                  <Trash2 /> Remove rate
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden /> Only the Business Owner can change the conversion rate.
          </p>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the conversion rate?"
        description="Without a rate, LedgerVision stops converting between USD and KHR everywhere. Totals, dashboards and reports will show each currency separately or exclude amounts in the other currency. No records are changed."
        confirmLabel="Remove rate"
        destructive
        onConfirm={() => remove.run()}
      />
    </Card>
  );
}

function ConversionRuleCard() {
  const rate = useAppStore((s) => s.business.khrPerUsd);
  return (
    <Card className={cn("gap-3", !rate && "border-warning/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {rate ? <Info className="size-4 text-info" aria-hidden /> : <AlertTriangle className="size-4 text-warning" aria-hidden />}
          How currency conversion works
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Every transaction, invoice and bill keeps its original currency. Stored amounts are never changed.</li>
          <li>Amounts are converted only for display, and only with the rate configured here. Converted totals are marked with “≈”.</li>
          <li>Without a rate, USD and KHR are never added together — amounts in the other currency are shown separately or excluded with a note.</li>
          <li>Changing the rate updates combined totals immediately across dashboards and reports.</li>
        </ul>
        {!rate && <p className="mt-3 text-sm font-medium text-warning-text">Conversions are currently disabled across the app.</p>}
      </CardContent>
    </Card>
  );
}

function DisplayCurrencyCard() {
  const business = useAppStore((s) => s.business);
  const canEdit = useCan("business.settings");
  const display = useUIStore((s) => s.displayCurrency);
  const setDisplay = useUIStore((s) => s.setDisplayCurrency);
  const [def, setDef] = useState<Currency>(business.defaultCurrency);
  useEffect(() => setDef(business.defaultCurrency), [business.defaultCurrency]);
  const save = useAction((c: Currency) => businessService.update({ defaultCurrency: c }), {
    success: "Default currency saved",
    onSuccess: () => setDisplay(def),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Display currency</CardTitle>
        <CardDescription>Which currency totals, KPIs and charts are shown in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label id="my-display-label" className="text-[13px] font-medium">
            Your display currency
          </Label>
          <CurrencyRadio labelledBy="my-display-label" name="my" value={display} onChange={(c) => { setDisplay(c); toast.success(`Showing totals in ${c}`); }} />
          <p className="text-xs text-muted-foreground">Applies to your view right away. You can also switch it from the top bar.</p>
        </div>
        <div className="space-y-2 border-t pt-5">
          <Label id="biz-default-label" className="text-[13px] font-medium">
            Business default currency
          </Label>
          <CurrencyRadio labelledBy="biz-default-label" name="biz" value={def} onChange={setDef} disabled={!canEdit} />
          <p className="text-xs text-muted-foreground">{canEdit ? "The starting display currency for everyone in your business and for new records." : "Set by the Business Owner."}</p>
        </div>
      </CardContent>
      {canEdit && (
        <CardFooter className="justify-end gap-2 border-t">
          <Button variant="outline" disabled={def === business.defaultCurrency || save.pending} onClick={() => setDef(business.defaultCurrency)}>
            Discard
          </Button>
          <Button disabled={def === business.defaultCurrency || save.pending} onClick={() => save.fire(def)}>
            {save.pending && <Loader2 className="animate-spin" />}
            Save default
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function CurrencyRadio({ value, onChange, disabled, labelledBy, name }: { value: Currency; onChange: (c: Currency) => void; disabled?: boolean; labelledBy: string; name: string }) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as Currency)} disabled={disabled} aria-labelledby={labelledBy} className="grid-cols-1 sm:grid-cols-2">
      {CURRENCIES.map((c) => (
        <Label
          key={c.code}
          htmlFor={`${name}-${c.code}`}
          className={cn("flex items-center gap-3 rounded-lg border p-3 font-normal", disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-muted/50", value === c.code && "border-primary bg-primary-light/40")}
        >
          <RadioGroupItem id={`${name}-${c.code}`} value={c.code} />
          <span>
            <span className="block text-sm font-medium">{c.code}</span>
            <span className="block text-xs text-muted-foreground">{c.label}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

function LanguageCard() {
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Language</CardTitle>
        <CardDescription>Interface language for navigation and common labels on this device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <RadioGroup value={language} onValueChange={(v) => { setLanguage(v as Language); toast.success("Language updated"); }} aria-label="Interface language" className="grid-cols-1 sm:grid-cols-2">
          {LANGUAGES.map((l) => (
            <Label key={l.value} htmlFor={`lang-${l.value}`} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal hover:bg-muted/50", language === l.value && "border-primary bg-primary-light/40")}>
              <RadioGroupItem id={`lang-${l.value}`} value={l.value} />
              <span>
                <span className="block text-sm font-medium" lang={l.value}>
                  {l.native}
                </span>
                <span className="block text-xs text-muted-foreground">{l.label}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">Khmer translation covers navigation and common actions in this demo; financial records are shown as entered.</p>
      </CardContent>
    </Card>
  );
}
