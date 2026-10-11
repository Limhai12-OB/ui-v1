"use client";

import * as React from "react";
import type { Currency } from "@/types";
import { CURRENCY_META } from "@/lib/currency";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  currency: Currency;
  value: number | "" | undefined;
  onValueChange: (v: number | "") => void;
};

/** Numeric money input with currency symbol; KHR accepts whole riel only. */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({ currency, value, onValueChange, className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden>
        {CURRENCY_META[currency].symbol}
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step={currency === "USD" ? "0.01" : "100"}
        min={0}
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value === "" ? "" : Number(e.target.value))}
        className={cn(
          "h-9 w-full min-w-0 rounded-lg border border-input bg-card py-1 pr-12 pl-7 text-sm tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground" aria-hidden>
        {currency}
      </span>
    </div>
  );
});
