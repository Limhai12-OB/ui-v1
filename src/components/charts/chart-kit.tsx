"use client";

import type { Currency } from "@/types";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * Chart conventions (validated palette in globals.css, see --chart-*):
 *  - chart-1 green  = income / revenue / primary series
 *  - chart-2 blue   = expenses / spending / comparison series
 *  - chart-3 orange, chart-4 violet, chart-5 pink = additional categories, in this fixed order
 * Lines 2px, recessive grid, single y-axis, legend for ≥2 series, tooltip on hover.
 */
export const SERIES = {
  income: "var(--chart-1)",
  expenses: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  c5: "var(--chart-5)",
} as const;

export const CATEGORICAL = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export const GRID_PROPS = { stroke: "var(--chart-grid)", strokeDasharray: "0", vertical: false } as const;
export const AXIS_PROPS = { tickLine: false, axisLine: false, tick: { fill: "var(--muted-foreground)", fontSize: 12 } } as const;

export function moneyTick(currency: Currency) {
  return (v: number) => formatMoney(v, currency, { compact: true });
}

interface TooltipEntry {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Shared tooltip body for Recharts `content` prop. */
export function ChartTooltip({
  active,
  payload,
  label,
  currency,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  currency?: Currency;
  labelFormatter?: (label: string | number | undefined, payload?: TooltipEntry[]) => React.ReactNode;
  valueFormatter?: (v: number, entry: TooltipEntry) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = (v: number, e: TooltipEntry) => (valueFormatter ? valueFormatter(v, e) : currency ? formatMoney(v, currency) : v.toLocaleString("en-US"));
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1.5 font-medium text-foreground">{labelFormatter ? labelFormatter(label, payload) : label}</p>}
      <ul className="space-y-1">
        {payload
          .filter((e) => typeof e.value === "number")
          .map((e) => (
            <li key={String(e.dataKey ?? e.name)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: e.color }} aria-hidden />
                {e.name}
              </span>
              <span className="font-medium tabular-nums text-foreground">{fmt(e.value as number, e)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** Legend rendered outside the SVG so it is accessible text. */
export function ChartLegend({ items, className }: { items: { label: string; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
