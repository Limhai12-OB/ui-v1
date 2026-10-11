"use client";

import Link from "next/link";
import { CheckCheck, ExternalLink } from "lucide-react";
import type { ID } from "@/types";
import { CategorySelect } from "@/components/forms/entity-selects";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TABLE_COLUMNS, type TableKind, type TableRowInput, type TableRowReview, type ValueState } from "../lib/doc-model";
import { STATE_META, StateChip } from "./field-editor";

const TH = "h-9 bg-muted/40 px-2 text-xs font-medium text-muted-foreground first:pl-3 last:pr-3";

function rowState(r: TableRowReview): ValueState {
  if (r.state === "error") return "error";
  if (r.state === "duplicate") return "duplicate";
  const edited = Object.values(r.edited).some(Boolean) || r.category?.origin === "user";
  if (r.category?.origin === "ai") return "ai";
  return edited ? "confirmed" : "extracted";
}

export function TableReview({
  kind,
  rows,
  onChange,
  onAcceptAI,
}: {
  kind: TableKind;
  rows: TableRowReview[];
  onChange: (line: number, patch: Partial<TableRowInput>) => void;
  onAcceptAI: () => void;
}) {
  const cols = TABLE_COLUMNS[kind];
  const aiCount = rows.filter((r) => r.category?.origin === "ai" && r.state !== "skipped").length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Edit any cell to correct it. {kind === "item_catalog" ? "Existing SKUs are always skipped." : "Duplicates are skipped unless you include them."}</p>
        {aiCount > 0 && (
          <Button size="sm" variant="outline" onClick={onAcceptAI}>
            <CheckCheck /> Confirm {aiCount} AI categor{aiCount === 1 ? "y" : "ies"}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={TH}>#</TableHead>
              {cols.map((c) => (
                <TableHead key={c.key} className={cn(TH, c.align === "right" && "text-right")}>
                  {c.label}
                  {c.required && <span aria-hidden className="text-destructive">*</span>}
                </TableHead>
              ))}
              <TableHead className={cn(TH, "min-w-44")}>Category</TableHead>
              <TableHead className={TH}>Status</TableHead>
              <TableHead className={TH}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const st = rowState(r);
              const income = /^(in|income|cr|credit|receipt)/i.test(r.cells.type ?? "");
              return (
                <TableRow key={r.line} className={cn(r.state === "skipped" && "opacity-50", r.state === "duplicate" && "bg-warning-light/20", r.state === "error" && "bg-error-light/15")}>
                  <TableCell className="px-2 pl-3 text-xs text-muted-foreground tabular-nums">{r.line}</TableCell>
                  {cols.map((c) => (
                    <TableCell key={c.key} className="px-2 py-1.5">
                      <Input
                        value={r.cells[c.key] ?? ""}
                        onChange={(e) => onChange(r.line, { cells: { ...r.cells, [c.key]: e.target.value }, edited: { ...r.edited, [c.key]: true } })}
                        aria-label={`${c.label}, line ${r.line}`}
                        aria-invalid={!!r.errors[c.key]}
                        title={r.errors[c.key]}
                        disabled={r.state === "skipped"}
                        className={cn("h-8 min-w-20 px-2 text-xs", c.align === "right" && "text-right tabular-nums", c.key === "name" || c.key === "description" ? "min-w-52" : "", r.edited[c.key] ? STATE_META.confirmed.box : r.errors[c.key] ? STATE_META.error.box : "bg-card")}
                      />
                      {r.errors[c.key] && <p className="mt-0.5 text-[10px] text-destructive">{r.errors[c.key]}</p>}
                    </TableCell>
                  ))}
                  <TableCell className="px-2 py-1.5">
                    <div className={cn("rounded-md", r.category?.origin === "ai" && "ring-1 ring-ai/40")}>
                      <CategorySelect
                        id={`row-cat-${r.line}`}
                        kind={kind === "item_catalog" ? "item" : income ? "income" : "expense"}
                        value={r.category?.value}
                        onChange={(v: ID) => onChange(r.line, { category: { value: v, origin: "user" } })}
                        placeholder={kind === "item_catalog" ? "Choose…" : "Needs review"}
                        disabled={r.state === "skipped"}
                        className={cn("h-8 w-full text-xs", r.category?.origin === "ai" && "bg-ai-light/40", r.errors.category && "border-error")}
                      />
                    </div>
                    {r.category?.origin === "ai" && <p className="mt-0.5 text-[10px] text-ai-text">AI · {Math.round((r.category.confidence ?? 0) * 100)}%</p>}
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    <div className="space-y-1">
                      <StateChip state={r.state === "skipped" ? "extracted" : st} className={r.state === "skipped" ? "opacity-70" : undefined} />
                      {r.state === "skipped" && <p className="text-[10px] text-muted-foreground">Skipped</p>}
                      {r.duplicate && (
                        <p className="text-[10px] text-warning-text">
                          {r.duplicate.href ? (
                            <Link href={r.duplicate.href} className="inline-flex items-center gap-0.5 hover:underline">
                              Exists: {r.duplicate.label} <ExternalLink className="size-2.5" aria-hidden />
                            </Link>
                          ) : (
                            r.duplicate.label
                          )}
                        </p>
                      )}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-[10px] text-warning-text">
                          {w}
                        </p>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 pr-3 text-right whitespace-nowrap">
                    {kind === "spreadsheet" && r.duplicate && r.state !== "skipped" && r.state !== "error" && (
                      <label className="mr-2 inline-flex items-center gap-1 text-[11px]">
                        <Switch checked={!!r.includeDuplicate} onCheckedChange={(v) => onChange(r.line, { includeDuplicate: v })} aria-label={`Include duplicate line ${r.line}`} /> Include
                      </label>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => onChange(r.line, { skip: !r.skip })}>
                      {r.skip ? "Undo skip" : "Skip"}
                    </Button>
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
