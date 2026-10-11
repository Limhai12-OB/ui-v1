"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Currency } from "@/types";
import { AXIS_PROPS, ChartLegend, GRID_PROPS, moneyTick } from "@/components/charts/chart-kit";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import type { ChartRow } from "./model";

interface TipProps {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
  currency: Currency;
  perDay: boolean;
}

function ForecastTooltip({ active, payload, currency, perDay }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const fm = (v: number) => formatMoney(v, currency);
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-foreground">
        {perDay ? `Week of ${formatDate(row.date, "d MMM")}` : formatDate(row.date, "d MMM yyyy")}
        {perDay && row.days < 7 && <span className="font-normal text-muted-foreground"> ({row.days} days)</span>}
      </p>
      <ul className="space-y-1">
        {row.actual !== undefined && (
          <li className="flex justify-between gap-4">
            <span className="text-muted-foreground">Actual{perDay ? " (avg/day)" : ""}</span>
            <span className="font-medium tabular-nums">{fm(row.actual)}</span>
          </li>
        )}
        {row.forecast && row.p50 !== undefined && (
          <li className="flex justify-between gap-4">
            <span className="text-muted-foreground">Expected (P50){perDay ? " avg/day" : ""}</span>
            <span className="font-medium tabular-nums">{fm(row.p50)}</span>
          </li>
        )}
        {row.forecast && row.band && (
          <li className="flex justify-between gap-4">
            <span className="text-muted-foreground">P10–P90 range</span>
            <span className="tabular-nums">
              {fm(row.band[0])} – {fm(row.band[1])}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * History (solid) + expected P50 (dashed) + shaded P10–P90 band, all one hue.
 * Single y-axis; a reference line marks "today".
 */
export function ForecastChart({ rows, color, currency, perDay, label, height = 240 }: { rows: ChartRow[]; color: string; currency: Currency; perDay: boolean; label: string; height?: number }) {
  const todayRow = rows.filter((r) => !r.forecast).at(-1);
  const last = rows.at(-1);
  return (
    <div className="space-y-2">
      <ChartLegend
        items={[
          { label: "Actual", color },
          { label: "Expected (P50)", color, dashed: true },
          { label: "P10–P90 range", color: `color-mix(in oklab, ${color} 22%, transparent)` },
        ]}
      />
      <div style={{ height }} role="img" aria-label={`${label}. ${last?.p50 !== undefined ? `Expected ${formatMoney(last.p50, currency)} at the end of the horizon, range ${formatMoney(last.band?.[0] ?? 0, currency)} to ${formatMoney(last.band?.[1] ?? 0, currency)}.` : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={24} interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={60} tickFormatter={moneyTick(currency)} domain={["auto", "auto"]} />
            <Tooltip cursor={{ stroke: "var(--border)" }} content={<ForecastTooltip currency={currency} perDay={perDay} />} />
            <Area type="monotone" dataKey="band" stroke="none" fill={color} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
            {todayRow && <ReferenceLine x={todayRow.label} stroke="var(--border)" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />}
            <Line type="monotone" dataKey="actual" stroke={color} strokeWidth={2} dot={false} connectNulls={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            <Line type="monotone" dataKey="p50" stroke={color} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
