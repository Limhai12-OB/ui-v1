"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, CheckCheck, Copy, ExternalLink, Undo2, Wrench } from "lucide-react";
import type { Currency, ID } from "@/types";
import { useLookups } from "@/hooks/use-lookup";
import { AIBadge } from "@/components/shared/demo-notice";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { CategorySelect } from "@/components/forms/entity-selects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, today } from "@/lib/date";
import { formatPercent } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { LOW_CONFIDENCE } from "../categorize";
import type { ReviewedRow, RowOverride } from "./rows";

const TH = "h-10 bg-muted/40 px-3 text-xs font-medium text-muted-foreground first:pl-4 last:pr-4";
const TD = "px-3 py-2.5 first:pl-4 last:pr-4";

export function Confidence({ value }: { value: number }) {
  const low = value < LOW_CONFIDENCE;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", low ? "bg-warning" : "bg-ai")} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className={cn("text-xs tabular-nums", low ? "text-warning-text" : "text-muted-foreground")}>{formatPercent(value * 100, 0)}</span>
      {low && (
        <Badge variant="warning" className="h-4 px-1 text-[10px]">
          <AlertTriangle /> Low
        </Badge>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4 — AI category suggestions                                    */
/* ------------------------------------------------------------------ */

export function CategorizeStep({ rows, currency, onSetCategory, onAcceptAll }: { rows: ReviewedRow[]; currency: Currency; onSetCategory: (line: number, categoryId: ID | undefined) => void; onAcceptAll: (includeLow: boolean) => void }) {
  const { categoryName } = useLookups();
  const [filter, setFilter] = useState<"all" | "low" | "open">("all");
  const candidates = rows.filter((r) => r.errors.length === 0 && r.state !== "skipped");
  const low = candidates.filter((r) => !r.suggestion || r.suggestion.confidence < LOW_CONFIDENCE);
  const open = candidates.filter((r) => !r.categoryId);
  const list = filter === "low" ? low : filter === "open" ? open : candidates;
  const confirmed = candidates.length - open.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-ai/20 bg-ai-light/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AIBadge label="Simulated AI" />
            <p className="text-sm font-medium">Category suggestions for {candidates.length} rows</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested by deterministic keyword rules standing in for the categorization model. Confirm a category to post the row; unconfirmed rows are imported as <strong>Needs review</strong> and stay out of reports.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={() => onAcceptAll(false)}>
            <Check /> Accept high-confidence
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAcceptAll(true)}>
            <CheckCheck /> Accept all
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({candidates.length})</TabsTrigger>
            <TabsTrigger value="low">Low confidence ({low.length})</TabsTrigger>
            <TabsTrigger value="open">Unconfirmed ({open.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground tabular-nums" role="status" aria-live="polite">
          {confirmed} confirmed · {open.length} will go to review
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TH}>Date</TableHead>
              <TableHead className={TH}>Description</TableHead>
              <TableHead className={cn(TH, "text-right")}>Amount</TableHead>
              <TableHead className={TH}>AI suggestion</TableHead>
              <TableHead className={TH}>Confidence</TableHead>
              <TableHead className={cn(TH, "min-w-52")}>Category</TableHead>
              <TableHead className={TH}>
                <span className="sr-only">Accept</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="p-0">
                  <EmptyState compact title={filter === "open" ? "Every row has a confirmed category" : "No rows in this view"} />
                </TableCell>
              </TableRow>
            )}
            {list.map((r) => {
              const income = (r.amount ?? 0) > 0;
              const accepted = !!r.categoryId && r.categoryId === r.suggestion?.categoryId;
              return (
                <TableRow key={r.line} className={cn(r.suggestion && r.suggestion.confidence < LOW_CONFIDENCE && !r.categoryId && "bg-warning-light/20")}>
                  <TableCell className={cn(TD, "text-sm whitespace-nowrap tabular-nums")}>{formatDate(r.date)}</TableCell>
                  <TableCell className={cn(TD, "max-w-72")}>
                    <p className="truncate text-sm">{r.description}</p>
                    {r.duplicate && (
                      <Badge variant="warning" className="mt-0.5">
                        <Copy /> Possible duplicate — reviewed next
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className={cn(TD, "text-right")}>
                    <Money amount={r.amount!} currency={currency} tone />
                  </TableCell>
                  <TableCell className={TD}>
                    {r.suggestion ? (
                      <div>
                        <span className="inline-flex items-center rounded-md bg-ai-light px-1.5 py-0.5 text-xs font-medium text-ai-text">{categoryName(r.suggestion.categoryId)}</span>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{r.suggestion.reason}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No suggestion</span>
                    )}
                  </TableCell>
                  <TableCell className={TD}>{r.suggestion ? <Confidence value={r.suggestion.confidence} /> : <span className="text-xs text-warning-text">—</span>}</TableCell>
                  <TableCell className={TD}>
                    <CategorySelect id={`cat-${r.line}`} kind={income ? "income" : "expense"} value={r.categoryId} onChange={(v) => onSetCategory(r.line, v)} placeholder="Needs review" className={cn("h-8 w-full", r.categoryId && "border-success/50")} />
                  </TableCell>
                  <TableCell className={cn(TD, "text-right whitespace-nowrap")}>
                    {r.categoryId ? (
                      <Button size="xs" variant="ghost" onClick={() => onSetCategory(r.line, undefined)} aria-label={`Undo category for line ${r.line}`}>
                        <Undo2 /> {accepted ? "Accepted" : "Set"}
                      </Button>
                    ) : r.suggestion ? (
                      <Button size="xs" variant="outline" onClick={() => onSetCategory(r.line, r.suggestion!.categoryId)} aria-label={`Accept suggestion for line ${r.line}`}>
                        <Check /> Accept
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5 — duplicates & missing information                           */
/* ------------------------------------------------------------------ */

export function DuplicatesStep({ rows, currency, onOverride }: { rows: ReviewedRow[]; currency: Currency; onOverride: (line: number, patch: Partial<RowOverride> | null) => void }) {
  const dups = rows.filter((r) => r.duplicate && r.errors.length === 0 && r.state !== "skipped");
  const errs = rows.filter((r) => r.errors.length > 0 || (r.state === "skipped" && r.errors.length > 0));
  const skipped = rows.filter((r) => r.state === "skipped");
  const fixedRows = rows.filter((r) => r.fixed && r.errors.length === 0);
  const lineOf = (key?: string) => rows.find((x) => x.key === key && x.duplicate !== "file")?.line;

  return (
    <div className="space-y-8">
      <section aria-labelledby="dup-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="dup-h" className="text-base font-semibold">
              Duplicates <span className="text-muted-foreground tabular-nums">({dups.length})</span>
            </h3>
            <p className="text-xs text-muted-foreground">Matched on account, date, signed amount and description. Duplicates are excluded unless you include them.</p>
          </div>
        </div>
        {dups.length === 0 ? (
          <div className="rounded-xl border">
            <EmptyState compact title="No duplicates found" description="None of these rows match transactions already in this account." />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={TH}>Line</TableHead>
                  <TableHead className={TH}>Date</TableHead>
                  <TableHead className={TH}>Description</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Amount</TableHead>
                  <TableHead className={TH}>Matched</TableHead>
                  <TableHead className={cn(TH, "text-right")}>Include</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dups.map((r) => (
                  <TableRow key={r.line} className={cn(r.state === "duplicate" && "text-muted-foreground")}>
                    <TableCell className={cn(TD, "text-xs tabular-nums")}>{r.line}</TableCell>
                    <TableCell className={cn(TD, "text-sm whitespace-nowrap tabular-nums")}>{formatDate(r.date)}</TableCell>
                    <TableCell className={cn(TD, "max-w-72 truncate text-sm")}>{r.description}</TableCell>
                    <TableCell className={cn(TD, "text-right")}>
                      <Money amount={r.amount!} currency={currency} tone />
                    </TableCell>
                    <TableCell className={TD}>
                      {r.duplicate === "ledger" ? (
                        <Link href={`/transactions/${r.duplicateOf}`} className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          <Copy className="size-3" aria-hidden /> Already in ledger <ExternalLink className="size-3" aria-hidden />
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Copy className="size-3" aria-hidden /> Repeats line {lineOf(r.key) ?? "above"} in this file
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn(TD, "text-right")}>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs">{r.state === "duplicate" ? "Skipped" : "Included"}</span>
                        <Switch checked={r.state !== "duplicate"} onCheckedChange={(v) => onOverride(r.line, { includeDuplicate: v })} aria-label={`Include line ${r.line} even though it looks like a duplicate`} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="err-h" className="space-y-3">
        <div>
          <h3 id="err-h" className="text-base font-semibold">
            Missing or invalid information <span className="text-muted-foreground tabular-nums">({errs.length})</span>
          </h3>
          <p className="text-xs text-muted-foreground">Fix a row inline to import it, or skip it. Rows left with errors are not imported.</p>
        </div>
        {errs.length === 0 ? (
          <div className="rounded-xl border">
            <EmptyState compact title="Every row has a date, amount and description" description={fixedRows.length ? `${fixedRows.length} row${fixedRows.length > 1 ? "s" : ""} fixed by you.` : undefined} />
          </div>
        ) : (
          <ul className="space-y-3">
            {errs.map((r) => (
              <ErrorRowFixer key={r.line} row={r} currency={currency} skipped={r.state === "skipped"} onOverride={onOverride} />
            ))}
          </ul>
        )}
        {fixedRows.length > 0 && errs.length > 0 && <p className="text-xs text-success-text">{fixedRows.length} fixed row{fixedRows.length > 1 ? "s are" : " is"} now valid and will be imported.</p>}
        {skipped.length > 0 && <p className="text-xs text-muted-foreground">{skipped.length} row(s) skipped by you.</p>}
      </section>
    </div>
  );
}

function ErrorRowFixer({ row, currency, skipped, onOverride }: { row: ReviewedRow; currency: Currency; skipped: boolean; onOverride: (line: number, patch: Partial<RowOverride> | null) => void }) {
  const initialAmount = row.amount !== undefined && !Number.isNaN(row.amount) ? Math.abs(row.amount) : "";
  const [date, setDate] = useState(row.date ?? "");
  const [desc, setDesc] = useState(row.description);
  const [amount, setAmount] = useState<string>(String(initialAmount));
  const [dir, setDir] = useState<"in" | "out">(row.amount !== undefined && !Number.isNaN(row.amount) && row.amount > 0 ? "in" : row.amountRaw.startsWith("+") ? "in" : "out");
  const [err, setErr] = useState<string | null>(null);

  const apply = () => {
    const n = Number(amount);
    if (!date) return setErr("Enter a date.");
    if (date > today()) return setErr("The date can't be in the future.");
    if (!desc.trim()) return setErr("Enter a description.");
    if (!amount || !Number.isFinite(n) || n <= 0) return setErr("Enter an amount greater than zero.");
    if (currency === "KHR" && !Number.isInteger(n)) return setErr("KHR amounts must be whole riel.");
    setErr(null);
    onOverride(row.line, { date, description: desc.trim(), amount: dir === "in" ? n : -n, skip: false });
  };

  return (
    <li className={cn("rounded-xl border p-4", skipped ? "bg-muted/40" : "border-error/30 bg-error-light/20")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Line {row.line}: <span className="font-normal">{row.description || "(no description)"}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-1.5">
            {row.errors.map((e) => (
              <Badge key={e} variant="error">
                <AlertTriangle /> {e}
              </Badge>
            ))}
            {skipped && <Badge variant="neutral">Skipped</Badge>}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">Raw: {row.raw.join(" | ")}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onOverride(row.line, skipped ? { skip: false } : { skip: true })}>
          {skipped ? "Undo skip" : "Skip row"}
        </Button>
      </div>
      {!skipped && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[150px_1fr_110px_140px_auto] sm:items-end">
          <label className="space-y-1 text-xs font-medium">
            Date
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="h-8" aria-invalid={!date} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            Description
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-8" />
          </label>
          <label className="space-y-1 text-xs font-medium">
            Direction
            <Select value={dir} onValueChange={(v) => setDir(v as "in" | "out")}>
              <SelectTrigger className="h-8 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Money in</SelectItem>
                <SelectItem value="out">Money out</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Amount ({currency})
            <Input type="number" inputMode="decimal" min={0} step={currency === "USD" ? "0.01" : "100"} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 tabular-nums" aria-invalid={!amount} />
          </label>
          <Button size="sm" onClick={apply}>
            <Wrench /> Apply fix
          </Button>
          {err && (
            <p role="alert" className="text-xs text-destructive sm:col-span-5">
              {err}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
