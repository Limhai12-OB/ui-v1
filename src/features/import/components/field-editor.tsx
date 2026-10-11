"use client";

import { AlertTriangle, CheckCircle2, Copy, ScanText, Sparkles, type LucideIcon } from "lucide-react";
import type { Currency } from "@/types";
import { AccountSelect, BranchSelect, CategorySelect, CurrencySelect } from "@/components/forms/entity-selects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPercent } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { FieldDef, FieldSuggestion, FieldValue, ValueState } from "../lib/doc-model";

export const STATE_META: Record<ValueState, { label: string; icon: LucideIcon; box: string; chip: string }> = {
  extracted: { label: "Extracted", icon: ScanText, box: "border-info/40 bg-info-light/25", chip: "bg-info-light text-info-text" },
  ai: { label: "AI suggestion", icon: Sparkles, box: "border-ai/40 bg-ai-light/40", chip: "bg-ai-light text-ai-text" },
  confirmed: { label: "Confirmed", icon: CheckCircle2, box: "border-success/40 bg-success-light/25", chip: "bg-success-light text-success-text" },
  error: { label: "Error", icon: AlertTriangle, box: "border-error/50 bg-error-light/30", chip: "bg-error-light text-error-text" },
  duplicate: { label: "Duplicate record", icon: Copy, box: "border-warning/50 bg-warning-light/40", chip: "bg-warning-light text-warning-text" },
};

export function StateChip({ state, className }: { state: ValueState; className?: string }) {
  const m = STATE_META[state];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", m.chip, className)}>
      <Icon className="size-3" aria-hidden /> {m.label}
    </span>
  );
}

/** Legend that explains the five value states used across the import UI. */
export function ValueLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Legend">
      <span className="text-xs text-muted-foreground">Legend:</span>
      {(Object.keys(STATE_META) as ValueState[]).map((s) => (
        <StateChip key={s} state={s} />
      ))}
    </div>
  );
}

export function FieldEditor({
  def,
  field,
  state,
  error,
  suggestion,
  currency,
  onChange,
  onConfirm,
  onApply,
}: {
  def: FieldDef;
  field?: FieldValue;
  state: ValueState;
  error?: string;
  suggestion?: FieldSuggestion;
  currency?: Currency;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onApply: (s: FieldSuggestion) => void;
}) {
  const id = `fld-${def.key}`;
  const value = field?.value ?? "";
  const pendingSuggestion = suggestion && suggestion.value !== value ? suggestion : undefined;
  const control = (() => {
    switch (def.type) {
      case "currency":
        return <CurrencySelect id={id} value={value || undefined} onChange={onChange} />;
      case "expenseCategory":
        return <CategorySelect id={id} kind="expense" value={value || undefined} onChange={onChange} aria-invalid={!!error} />;
      case "incomeCategory":
        return <CategorySelect id={id} kind="income" value={value || undefined} onChange={onChange} aria-invalid={!!error} />;
      case "account":
        return <AccountSelect id={id} value={value || undefined} onChange={onChange} currency={currency} aria-invalid={!!error} />;
      case "branch":
        return <BranchSelect id={id} value={value || undefined} onChange={onChange} aria-invalid={!!error} />;
      case "date":
        return <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="bg-card" />;
      case "money":
        return <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="bg-card text-right tabular-nums" placeholder={currency === "KHR" ? "0" : "0.00"} />;
      default:
        return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className="bg-card" />;
    }
  })();

  return (
    <div className={cn("space-y-1.5 rounded-lg border p-3 transition-colors", STATE_META[state].box)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[13px] font-medium">
          {def.label}
          {def.required && (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          )}
        </Label>
        <div className="flex items-center gap-1.5">
          {field?.confidence !== undefined && field.origin !== "user" && field.value && <span className="text-[11px] text-muted-foreground tabular-nums">{formatPercent(field.confidence * 100, 0)} conf.</span>}
          <StateChip state={state} />
        </div>
      </div>
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : def.helper ? (
        <p className="text-xs text-muted-foreground">{def.helper}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {pendingSuggestion && (
          <div className="flex flex-1 flex-wrap items-center gap-2 rounded-md bg-ai-light/60 px-2 py-1 text-xs text-ai-text">
            <Sparkles className="size-3 shrink-0" aria-hidden />
            <span>
              Suggest <strong>{pendingSuggestion.label ?? pendingSuggestion.value}</strong> — {pendingSuggestion.reason} ({formatPercent(pendingSuggestion.confidence * 100, 0)})
            </span>
            <Button type="button" size="xs" variant="outline" className="ml-auto h-6 bg-card" onClick={() => onApply(pendingSuggestion)}>
              Apply
            </Button>
          </div>
        )}
        {!error && value && field && field.origin !== "user" && !field.confirmed && (
          <Button type="button" size="xs" variant="ghost" className="h-6" onClick={onConfirm} aria-label={`Confirm ${def.label}`}>
            <CheckCircle2 /> Confirm
          </Button>
        )}
      </div>
    </div>
  );
}
