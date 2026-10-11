"use client";

import Link from "next/link";
import { AlertOctagon, ArrowRight, CheckCircle2, Copy, FileClock, GitCompareArrows, HelpCircle, Loader2, RefreshCw, Upload } from "lucide-react";
import type { Currency, FinancialAccount, ImportBatch } from "@/types";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { summarize } from "./rows";

export type Summary = ReturnType<typeof summarize>;

function Tile({ label, value, tone, help }: { label: string; value: number; tone?: "success" | "warning" | "error" | "neutral"; help: string }) {
  return (
    <div className={cn("rounded-xl border p-4", tone === "success" && "border-success/30 bg-success-light/30", tone === "warning" && "border-warning/30 bg-warning-light/30", tone === "error" && "border-error/30 bg-error-light/20")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export function ConfirmStep({ summary, account, fileName, acknowledged, onAcknowledge }: { summary: Summary; account: FinancialAccount; fileName: string; acknowledged: boolean; onAcknowledge: (v: boolean) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Transactions to post" value={summary.toPost} tone="success" help={`${summary.categorized} with a confirmed category`} />
        <Tile label="Go to review" value={summary.toReview} tone="warning" help="Imported as Needs review (uncategorized)" />
        <Tile label="Duplicates skipped" value={summary.duplicates} tone="neutral" help={summary.duplicatesIncluded ? `${summary.duplicatesIncluded} duplicate(s) included by you` : "Already in the ledger or repeated"} />
        <Tile label="Errors skipped" value={summary.errors + summary.skipped} tone={summary.errors ? "error" : "neutral"} help={summary.skipped ? `${summary.skipped} skipped by you` : "Rows with missing or invalid data"} />
      </div>
      <Card className="gap-4 p-5">
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Account</p>
            <p className="font-medium">{account.name}</p>
            <p className="text-xs text-muted-foreground">
              {account.provider} · {account.accountNumber} · {account.currency}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Money in to post</p>
            <Money amount={summary.moneyIn} currency={account.currency} className="text-base font-semibold text-success-text" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Money out to post</p>
            <Money amount={summary.moneyOut} currency={account.currency} className="text-base font-semibold" />
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
          <Checkbox id="ack" checked={acknowledged} onCheckedChange={(v) => onAcknowledge(v === true)} className="mt-0.5" />
          <Label htmlFor="ack" className="text-sm leading-snug font-normal">
            I reviewed <strong>{fileName}</strong> and want to post {summary.toPost} transaction{summary.toPost === 1 ? "" : "s"} to {account.name}. Uncategorized rows will wait in the review queue and are excluded from reports until confirmed.
          </Label>
        </div>
        {summary.toPost === 0 && <p className="text-xs text-muted-foreground">Nothing new to post — confirming records the import in history with every row skipped.</p>}
      </Card>
    </div>
  );
}

export interface CommitResult {
  batchId: string;
  summary: Summary;
  accountId: string;
  error?: string;
}

export function ResultStep({
  phase,
  batch,
  result,
  currency,
  onRetry,
  onAgain,
  onNew,
}: {
  phase: "processing" | "done" | "error";
  batch?: ImportBatch;
  result?: CommitResult;
  currency: Currency;
  onRetry: () => void;
  onAgain: () => void;
  onNew: () => void;
}) {
  if (phase === "processing") {
    const stage = !batch ? 1 : 2;
    return (
      <div role="status" aria-live="polite" className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <div className="space-y-1">
          <p className="text-base font-medium">{stage === 1 ? "Creating import batch…" : `Posting ${result?.summary.toPost ?? ""} transactions…`}</p>
          <p className="text-sm text-muted-foreground">Please keep this page open. Records are posted only once the import service confirms.</p>
        </div>
        <Progress value={stage === 1 ? 25 : 70} className="h-1.5 w-64" aria-label="Import progress" />
        {batch && <StatusBadge status={batch.status} />}
      </div>
    );
  }
  if (phase === "error" || !result) {
    return (
      <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-error-light text-error-text">
          <AlertOctagon className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-medium">The import couldn&apos;t be completed</p>
          <p className="text-sm text-muted-foreground">{result?.error ?? "Something went wrong while posting."} No transactions were posted.</p>
        </div>
        <Button onClick={onRetry}>
          <RefreshCw /> Retry import
        </Button>
      </div>
    );
  }
  const s = result.summary;
  const status = batch?.status ?? (s.toReview > 0 ? "needs_review" : "completed");
  return (
    <div className="space-y-6">
      <div role="status" aria-live="polite" className={cn("flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-center", status === "needs_review" ? "border-warning/30 bg-warning-light/30" : "border-success/30 bg-success-light/30")}>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", status === "needs_review" ? "bg-warning-light text-warning-text" : "bg-success-light text-success-text")}>
          {status === "needs_review" ? <HelpCircle className="size-5" aria-hidden /> : <CheckCircle2 className="size-5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold">{s.toPost === 0 ? "Import recorded — nothing new to post" : `${s.toPost} transaction${s.toPost === 1 ? "" : "s"} imported`}</p>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {s.toReview > 0 ? `${s.toReview} need a category before they count in reports.` : s.toPost > 0 ? "All imported transactions are categorized and posted." : "Every row was a duplicate or had errors."}{" "}
            {s.duplicates > 0 && `${s.duplicates} duplicate${s.duplicates === 1 ? "" : "s"} skipped. `}
            {s.errors + s.skipped > 0 && `${s.errors + s.skipped} row${s.errors + s.skipped === 1 ? "" : "s"} with errors skipped.`}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Imported", s.toPost],
          ["Posted", s.categorized],
          ["Needs review", s.toReview],
          ["Duplicates", s.duplicates],
          ["Errors", s.errors + s.skipped],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{l}</dt>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {s.toPost > 0 && (
        <p className="text-sm text-muted-foreground">
          Net effect on the account: <Money amount={s.moneyIn - s.moneyOut} currency={currency} tone className="font-medium" />
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/accounts/${result.accountId}`}>
            View account transactions <ArrowRight />
          </Link>
        </Button>
        {s.toReview > 0 && (
          <Button variant="outline" asChild>
            <Link href="/banking/uncategorized">
              <HelpCircle /> Review uncategorized
            </Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={`/reconciliation/new?account=${result.accountId}`}>
            <GitCompareArrows /> Reconcile account
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/banking/import-history?batch=${result.batchId}`}>
            <FileClock /> Import history
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onAgain}>
          <Copy /> Import the same file again
        </Button>
        <Button variant="ghost" onClick={onNew}>
          <Upload /> Import another statement
        </Button>
      </div>
    </div>
  );
}
