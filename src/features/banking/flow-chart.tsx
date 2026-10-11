"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Currency } from "@/types";
import { AXIS_PROPS, ChartLegend, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";

export interface FlowPoint {
  label: string;
  moneyIn: number;
  moneyOut: number;
}

/** Grouped bars: money in (green) vs money out (blue), one currency, one axis. */
export function FlowChart({ data, currency, height = 240, inLabel = "Money in", outLabel = "Money out", ariaLabel }: { data: FlowPoint[]; currency: Currency; height?: number; inLabel?: string; outLabel?: string; ariaLabel: string }) {
  return (
    <div>
      <ChartLegend
        className="mb-3"
        items={[
          { label: inLabel, color: SERIES.income },
          { label: outLabel, color: SERIES.expenses },
        ]}
      />
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={12} />
            <YAxis {...AXIS_PROPS} width={64} tickFormatter={moneyTick(currency)} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip currency={currency} />} />
            <Bar dataKey="moneyIn" name={inLabel} fill={SERIES.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="moneyOut" name={outLabel} fill={SERIES.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
