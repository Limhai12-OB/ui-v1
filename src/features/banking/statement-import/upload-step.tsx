"use client";

import { AlertOctagon, CheckCircle2, FileSpreadsheet, FileWarning, Info, Loader2, RefreshCw } from "lucide-react";
import type { ID } from "@/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dropzone } from "@/features/import/components/dropzone";
import { formatBytes } from "@/features/import/lib/csv";
import { cn } from "@/lib/utils";
import { STATEMENT_SAMPLES, type StatementSample } from "./samples";
import type { ParsedStatement } from "./formats";

export interface UploadProblem {
  kind: "excel" | "failed" | "invalid";
  message: string;
  fileName: string;
  batchId?: ID;
}

export function UploadStep({
  parsed,
  parsing,
  problem,
  onFile,
  onSample,
  onRetry,
  onClear,
}: {
  parsed?: ParsedStatement;
  parsing: boolean;
  problem?: UploadProblem;
  onFile: (f: File) => void;
  onSample: (s: StatementSample) => void;
  onRetry: () => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Dropzone accept=".csv,.xlsx,.xls,text/csv" onFile={onFile} disabled={parsing} hint="CSV or Excel (.csv, .xlsx, .xls) exported from ABA, Wing, ACLEDA or another bank · up to 5 MB" />

        <div role="status" aria-live="polite">
          {parsing && (
            <Card className="flex-row items-center gap-3 p-4">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              <p className="text-sm">Reading file and detecting the bank format…</p>
            </Card>
          )}

          {!parsing && problem && (
            <Card className={cn("gap-3 p-4", problem.kind === "excel" ? "border-info/30 bg-info-light/40" : "border-error/30 bg-error-light/40")}>
              <div className="flex items-start gap-3">
                {problem.kind === "excel" ? <Info className="mt-0.5 size-4 shrink-0 text-info-text" aria-hidden /> : <AlertOctagon className="mt-0.5 size-4 shrink-0 text-error-text" aria-hidden />}
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{problem.kind === "excel" ? "Excel files are parsed by the import service" : problem.kind === "failed" ? "Import failed — the file couldn't be parsed" : "This file can't be imported"}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{problem.fileName}</span> — {problem.message}
                  </p>
                  {problem.kind === "failed" && problem.batchId && <p className="text-xs text-muted-foreground">Recorded as a failed import in Import history.</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-7">
                {problem.kind === "failed" && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    <RefreshCw /> Retry import
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onClear}>
                  Choose another file
                </Button>
              </div>
            </Card>
          )}

          {!parsing && parsed && (
            <Card className="gap-3 border-success/30 bg-success-light/30 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">File read successfully</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {parsed.fileName} · {formatBytes(parsed.fileSize)} · <span className="tabular-nums">{parsed.rows.length}</span> rows
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="info">Detected: {parsed.format.label}</Badge>
                    <span className="text-muted-foreground">Columns: {parsed.headers.join(", ")}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={onClear}>
                  Remove
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Or use a built-in sample</h3>
          <p className="text-xs text-muted-foreground">Realistic October 2026 exports for the demo business. They run through the same parser as your files.</p>
        </div>
        <ul className="space-y-2">
          {STATEMENT_SAMPLES.map((s) => {
            const active = parsed?.sampleId === s.id || (problem?.fileName === s.fileName && !parsed);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => onSample(s)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                    active && "border-primary bg-primary-light/40",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", s.id === "corrupted" ? "bg-error-light text-error-text" : "bg-primary-light text-primary")}>
                    {s.id === "corrupted" ? <FileWarning className="size-4" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{s.columns}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
