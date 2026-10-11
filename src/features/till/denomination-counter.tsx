"use client";

import { Controller, type Control } from "react-hook-form";
import { Minus, Plus } from "lucide-react";
import type { Currency } from "@/types";
import { Money } from "@/components/shared/money";
import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roundMoney } from "@/lib/currency";
import { noteLabel } from "./till-utils";
import type { TillFormValues } from "./till-form-schema";

function clampCount(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(99_999, Math.max(0, n)) : 0;
}

function CountStepper({ id, label, value, onChange, onBlur }: { id: string; label: string; value: number; onChange: (n: number) => void; onBlur: () => void }) {
  const v = Number.isFinite(value) ? value : 0;
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(Math.max(0, v - 1))} disabled={v <= 0} aria-label={`Remove one ${label}`} tabIndex={-1}>
        <Minus />
      </Button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        placeholder="0"
        value={v === 0 ? "" : v}
        onChange={(e) => onChange(clampCount(e.target.value))}
        onBlur={onBlur}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`Number of ${label}s`}
        className="h-8 w-16 rounded-lg border border-input bg-card px-2 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button type="button" variant="outline" size="icon-sm" onClick={() => onChange(v + 1)} aria-label={`Add one ${label}`} tabIndex={-1}>
        <Plus />
      </Button>
    </div>
  );
}

interface DenominationCounterProps {
  currency: Currency;
  notes: readonly number[];
  control: Control<TillFormValues>;
  counts: number[];
  coins?: number;
  total: number;
}

/** Count-per-denomination grid with steppers, row subtotals and a live total. */
export function DenominationCounter({ currency, notes, control, counts, coins, total }: DenominationCounterProps) {
  const name = currency === "USD" ? "usdCounts" : "khrCounts";
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">{currency === "USD" ? "Count US dollars" : "Count Khmer riel"}</CardTitle>
        <CardDescription>{currency === "USD" ? "Enter how many of each note are in the USD drawer, then any coins and cents." : "Enter how many of each riel note are in the KHR drawer."}</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th scope="col" className="py-2 pl-4 text-left font-medium">Denomination</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Count</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {notes.map((value, i) => {
              const label = noteLabel(value, currency);
              const id = `count-${currency}-${value}`;
              return (
                <tr key={value}>
                  <th scope="row" className="py-1.5 pl-4 text-left font-medium">
                    <label htmlFor={id} className="tabular-nums">
                      {label}
                    </label>
                  </th>
                  <td className="px-3 py-1.5">
                    <Controller
                      control={control}
                      name={`${name}.${i}`}
                      render={({ field }) => <CountStepper id={id} label={label} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                    />
                  </td>
                  <td className="py-1.5 pr-4 text-right">
                    <Money amount={roundMoney(value * (counts[i] || 0), currency)} currency={currency} className={counts[i] ? "" : "text-muted-foreground"} />
                  </td>
                </tr>
              );
            })}
            {currency === "USD" && (
              <tr>
                <th scope="row" className="py-1.5 pl-4 text-left font-medium">
                  <label htmlFor="count-USD-coins">Coins & cents</label>
                  <span className="block text-xs font-normal text-muted-foreground">Total value, e.g. 3.75</span>
                </th>
                <td className="px-3 py-1.5">
                  <Controller
                    control={control}
                    name="usdCoins"
                    render={({ field, fieldState }) => (
                      <div className="w-40">
                        <MoneyInput
                          id="count-USD-coins"
                          currency="USD"
                          value={Number.isFinite(field.value) && field.value !== 0 ? field.value : ""}
                          placeholder="0.00"
                          onValueChange={(v) => field.onChange(v === "" ? 0 : v)}
                          onBlur={field.onBlur}
                          aria-invalid={!!fieldState.error}
                          aria-describedby={fieldState.error ? "count-USD-coins-error" : undefined}
                        />
                        {fieldState.error && (
                          <p id="count-USD-coins-error" role="alert" className="mt-1 text-xs text-destructive">
                            {fieldState.error.message}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </td>
                <td className="py-1.5 pr-4 text-right">
                  <Money amount={coins || 0} currency="USD" className={coins ? "" : "text-muted-foreground"} />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30">
              <th scope="row" colSpan={2} className="py-2.5 pl-4 text-left font-semibold">
                Counted {currency}
              </th>
              <td className="py-2.5 pr-4 text-right font-semibold" aria-live="polite">
                <Money amount={total} currency={currency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
