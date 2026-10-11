"use client";

import { Info } from "lucide-react";
import type { Currency } from "@/types";
import { formatMoney, rateLabel, type FormatMoneyOptions } from "@/lib/currency";
import type { ConvertedSum } from "@/lib/analytics";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MoneyProps extends FormatMoneyOptions {
  amount: number;
  currency: Currency;
  className?: string;
  /** Color positive green / negative red (with sign) — for P&L style values. */
  tone?: boolean;
}

/** A formatted monetary amount in its own currency, with tabular numerals. */
export function Money({ amount, currency, className, tone, ...opts }: MoneyProps) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", tone && amount > 0 && "text-success-text", tone && amount < 0 && "text-error-text", className)}>
      {formatMoney(amount, currency, { signed: tone, ...opts })}
    </span>
  );
}

/**
 * A total in the display currency that may include converted amounts.
 * Converted totals are marked with "≈" and a tooltip naming the configured rate.
 */
export function ConvertedMoney({ sum, currency, rate, className, compact }: { sum: ConvertedSum; currency: Currency; rate: number | null; className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums whitespace-nowrap", className)}>
      {sum.converted && <span aria-label="approximately">≈</span>}
      {formatMoney(sum.value, currency, { compact })}
      {(sum.converted || sum.excludedForeign) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="inline-flex rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Currency conversion details">
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs">
            {sum.converted
              ? `Includes amounts in another currency converted at the configured rate (${rateLabel(rate)}).`
              : "Amounts in another currency are excluded because no conversion rate is configured."}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** Inline note shown under charts/tables that combine converted amounts. */
export function ConversionNote({ converted, excludedForeign, rate, currency, className }: { converted: boolean; excludedForeign: boolean; rate: number | null; currency: Currency; className?: string }) {
  if (!converted && !excludedForeign) return null;
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {converted
        ? `Shown in ${currency}. Amounts in the other currency are converted at the configured rate ${rateLabel(rate)}.`
        : `Shown in ${currency} only. Amounts in the other currency are excluded — configure a conversion rate in Settings to include them.`}
    </p>
  );
}
