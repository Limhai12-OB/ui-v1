"use client";

import { Fragment } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AdvisorBlock } from "@/types";
import { AXIS_PROPS, ChartLegend, ChartTooltip, GRID_PROPS, SERIES, moneyTick } from "@/components/charts/chart-kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Minimal, safe markdown: paragraphs, "- " bullets, **bold**, _italic_ (no HTML). */
export function RichText({ text, className }: { text: string; className?: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <em key={i} className="text-xs not-italic text-muted-foreground">{part.slice(1, -1)}</em>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {paragraphs.map((p, i) => {
        const lines = p.split("\n");
        const bullets = lines.filter((l) => l.startsWith("- "));
        if (bullets.length && bullets.length === lines.length) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
            </ul>
          );
        }
        if (bullets.length) {
          return (
            <div key={i} className="space-y-1">
              {lines.filter((l) => !l.startsWith("- ")).map((l, j) => <p key={`p${j}`}>{inline(l)}</p>)}
              <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
                {bullets.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
              </ul>
            </div>
          );
        }
        return <p key={i}>{inline(p)}</p>;
      })}
    </div>
  );
}

function isRevenueLike(title: string) {
  return /revenue|sales|items|income/i.test(title);
}

export function MessageBlock({ block }: { block: AdvisorBlock }) {
  if (block.kind === "kpis") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {block.items.map((k) => {
          const Icon = k.tone === "positive" ? ArrowUpRight : k.tone === "negative" ? ArrowDownRight : Minus;
          return (
            <div key={k.label} className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">{k.value}</p>
              {k.delta && (
                <p className={cn("mt-0.5 inline-flex items-center gap-0.5 text-xs tabular-nums", k.tone === "positive" && "text-success-text", k.tone === "negative" && "text-error-text", (!k.tone || k.tone === "neutral") && "text-muted-foreground")}>
                  {k.tone && k.tone !== "neutral" && <Icon className="size-3" aria-hidden />}
                  {k.delta}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (block.kind === "table") {
    const numericCol = block.columns.map((_, ci) => block.rows.every((r) => typeof r[ci] === "number" || /^[−+-]?[$៛≈(]|^[−+-]?\d[\d,.]*%?$|^n\/a$|^—$/.test(String(r[ci]))));
    return (
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {block.columns.map((c, i) => (
                <TableHead key={c + i} className={cn("h-9 text-xs", numericCol[i] && i > 0 && "text-right")}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((r, ri) => (
              <TableRow key={ri}>
                {r.map((cell, ci) => (
                  <TableCell key={ci} className={cn("py-2 text-[13px]", numericCol[ci] && ci > 0 && "text-right tabular-nums", ci === 0 && "font-medium")}>
                    {typeof cell === "number" ? cell.toLocaleString("en-US") : cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (block.kind === "bar") {
    const color = isRevenueLike(block.title) ? SERIES.income : SERIES.expenses;
    const height = Math.max(140, block.data.length * 34 + 30);
    return (
      <figure className="rounded-lg border bg-card p-3">
        <figcaption className="mb-2 text-xs font-medium text-muted-foreground">{block.title}</figcaption>
        <div style={{ height }} role="img" aria-label={`${block.title}: ${block.data.map((d) => `${d.label} ${moneyTick(block.currency)(d.value)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={block.data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid {...GRID_PROPS} vertical horizontal={false} />
              <XAxis type="number" {...AXIS_PROPS} tickFormatter={moneyTick(block.currency)} />
              <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={150} tick={{ ...AXIS_PROPS.tick, fontSize: 12 }} />
              <Tooltip cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }} content={<ChartTooltip currency={block.currency} />} />
              <Bar dataKey="value" name={block.title.split(" — ")[0]} fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    );
  }

  // line
  const [sa, sb] = block.series;
  const pair = sa === "Revenue" && sb === "Expenses";
  const colorA = SERIES.income;
  const colorB = pair ? SERIES.expenses : "var(--muted-foreground)";
  return (
    <figure className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs font-medium text-muted-foreground">{block.title}</figcaption>
        {sb && <ChartLegend items={[{ label: sa, color: colorA }, { label: sb, color: colorB, dashed: !pair }]} />}
      </div>
      <div className="h-48" role="img" aria-label={`${block.title} line chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={block.data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={16} interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={56} tickFormatter={moneyTick(block.currency)} />
            <Tooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltip currency={block.currency} />} />
            <Line type="monotone" dataKey="a" name={sa} stroke={colorA} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            {sb && <Line type="monotone" dataKey="b" name={sb} stroke={colorB} strokeWidth={2} strokeDasharray={pair ? undefined : "5 4"} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
