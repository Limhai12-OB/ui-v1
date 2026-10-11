"use client";

import { AlertTriangle, Wand2 } from "lucide-react";
import type { Currency } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/forms/field";
import { Money } from "@/components/shared/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { DATE_FORMATS, type DateFormat } from "@/features/import/lib/csv";
import { NONE, mappingProblems, type AmountMode, type ColumnMapping, type ParsedStatement } from "./formats";
import type { MappedRow } from "./rows";

const PREVIEW_ROWS = 8;

export function MappingStep({ parsed, mapping, onChange, mapped, currency, autoDetected }: { parsed: ParsedStatement; mapping: ColumnMapping; onChange: (m: ColumnMapping) => void; mapped: MappedRow[]; currency: Currency; autoDetected: boolean }) {
  const problems = mappingProblems(mapping);
  const set = <K extends keyof ColumnMapping>(k: K, v: ColumnMapping[K]) => onChange({ ...mapping, [k]: v });
  const colSelect = (k: "date" | "description" | "moneyIn" | "moneyOut" | "amount" | "type" | "reference", label: string, optional = false) => (
    <Field label={label} htmlFor={`map-${k}`} required={!optional}>
      <Select value={mapping[k]} onValueChange={(v) => set(k, v)}>
        <SelectTrigger id={`map-${k}`} className="w-full" aria-invalid={!optional && mapping[k] === NONE}>
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{optional ? "— Not mapped —" : "— Select column —"}</SelectItem>
          {parsed.headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );

  const preview = mapped.slice(0, PREVIEW_ROWS);
  const dateHits = mapped.filter((r) => r.date).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {autoDetected && parsed.format.id !== "generic" ? (
          <Badge variant="ai">
            <Wand2 /> Auto-detected {parsed.format.label} layout
          </Badge>
        ) : (
          <Badge variant="neutral">Generic layout — check each mapping</Badge>
        )}
        <span className="text-xs text-muted-foreground">You can change any mapping; the preview updates immediately.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {colSelect("date", "Date")}
        <Field label="Date format" htmlFor="map-datefmt" required helper={`${dateHits} of ${mapped.length} rows parse with this format`}>
          <Select value={mapping.dateFormat} onValueChange={(v) => set("dateFormat", v as DateFormat)}>
            <SelectTrigger id="map-datefmt" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {colSelect("description", "Description")}
        {colSelect("reference", "Reference", true)}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium">How are amounts shown?</legend>
        <RadioGroup value={mapping.amountMode} onValueChange={(v) => set("amountMode", v as AmountMode)} className="flex flex-wrap gap-4">
          {(
            [
              ["split", "Separate money in / out (or credit / debit) columns"],
              ["typed", "One amount column + CR/DR type column"],
              ["signed", "One signed amount column (negative = money out)"],
            ] as const
          ).map(([v, l]) => (
            <div key={v} className="flex items-center gap-2">
              <RadioGroupItem value={v} id={`mode-${v}`} />
              <Label htmlFor={`mode-${v}`} className="text-sm font-normal">
                {l}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mapping.amountMode === "split" && (
            <>
              {colSelect("moneyIn", "Money in / Credit")}
              {colSelect("moneyOut", "Money out / Debit")}
            </>
          )}
          {mapping.amountMode !== "split" && colSelect("amount", "Amount")}
          {mapping.amountMode === "typed" && colSelect("type", "CR/DR type")}
        </div>
      </fieldset>

      {problems.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-light/50 px-3 py-2 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Preview <span className="font-normal text-muted-foreground">· first {Math.min(PREVIEW_ROWS, mapped.length)} of {mapped.length} rows</span>
        </h3>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-muted/40 pl-4 text-xs">#</TableHead>
                <TableHead className="bg-muted/40 text-xs">File: {mapping.date !== NONE ? mapping.date : "date"}</TableHead>
                <TableHead className="bg-muted/40 text-xs">→ Date</TableHead>
                <TableHead className="bg-muted/40 text-xs">→ Description</TableHead>
                <TableHead className="bg-muted/40 text-right text-xs">→ Amount ({currency})</TableHead>
                <TableHead className="bg-muted/40 pr-4 text-xs">→ Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r) => {
                const badAmount = r.amount === undefined || Number.isNaN(r.amount);
                return (
                  <TableRow key={r.line}>
                    <TableCell className="pl-4 text-xs text-muted-foreground tabular-nums">{r.line}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.dateRaw || "∅"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{r.date ? formatDate(r.date) : <span className="text-error-text">{r.dateRaw ? "Unreadable" : "Missing"}</span>}</TableCell>
                    <TableCell className="max-w-72 truncate text-sm">{r.description || <span className="text-error-text">Missing</span>}</TableCell>
                    <TableCell className="text-right text-sm">{badAmount ? <span className="text-error-text">{r.amount === undefined ? "Missing" : "Unreadable"}</span> : <Money amount={r.amount!} currency={currency} tone />}</TableCell>
                    <TableCell className="pr-4 font-mono text-xs text-muted-foreground">{r.reference ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
