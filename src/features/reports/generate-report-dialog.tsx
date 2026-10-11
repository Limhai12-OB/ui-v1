"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { MonthlyReport } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { aiService } from "@/lib/api";
import { formatMonth } from "@/lib/date";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { StatusBadge } from "@/components/shared/status-badge";
import { reportReadiness } from "./readiness";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Months eligible for (re)generation, newest first. */
  months: string[];
  initialMonth?: string;
}

/** Generate or regenerate a monthly report, with a readiness preview. */
export function GenerateReportDialog({ open, onOpenChange, months, initialMonth }: Props) {
  const { branches } = useScope();
  // Reports cover the whole business the user can access, independent of the branch selector.
  const scope = useMemo(() => ({ branchIds: branches.map((b) => b.id) }), [branches]);
  const accounts = useAppStore((s) => s.accounts);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const transactions = useAppStore((s) => s.transactions);
  const reports = useAppStore((s) => s.reports);
  const [month, setMonth] = useState<string>(initialMonth ?? months[0] ?? "");
  const [result, setResult] = useState<MonthlyReport | null>(null);

  useEffect(() => {
    if (open) {
      setMonth(initialMonth && months.includes(initialMonth) ? initialMonth : (months[0] ?? ""));
      setResult(null);
    }
  }, [open, initialMonth, months]);

  const issues = useMemo(() => (month ? reportReadiness(month, { accounts, reconciliations, transactions }, scope) : []), [month, accounts, reconciliations, transactions, scope]);
  const existing = reports.find((r) => r.month === month);
  const gen = useAction((m: string) => aiService.generateReport(m, scope, "all"), {
    success: (r) => (r.status === "complete" ? `${formatMonth(r.month)} report is complete` : r.status === "incomplete" ? `${formatMonth(r.month)} report generated as incomplete` : `${formatMonth(r.month)} report failed`),
    errorTitle: "Report generation failed",
    onSuccess: (r) => setResult(r),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !gen.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Regenerate report" : "Generate report"}</DialogTitle>
          <DialogDescription>Reports summarize a closed month from your posted transactions. A report is complete only when every bank and e-wallet account is reconciled and all transactions are categorized.</DialogDescription>
        </DialogHeader>

        {months.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Every closed month already has a complete report. October 2026 can be generated after the month closes.</p>
        ) : result ? (
          <div className="space-y-3 py-2" role="status">
            <div className="flex items-center gap-2">
              <StatusBadge status={result.status} />
              <span className="text-sm font-medium">{formatMonth(result.month)}</span>
            </div>
            {result.status === "complete" && <p className="text-sm text-muted-foreground">All accounts are reconciled and every transaction is categorized.</p>}
            {result.missing.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {result.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <Field label="Month" htmlFor="gen-month" required>
              <Select value={month} onValueChange={setMonth} disabled={gen.pending}>
                <SelectTrigger id="gen-month" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => {
                    const r = reports.find((x) => x.month === m);
                    return (
                      <SelectItem key={m} value={m}>
                        {formatMonth(m)}
                        {r ? ` — currently ${r.status}` : " — not generated"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Readiness check (live)</p>
              {issues.length === 0 ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-success-text">
                  <CheckCircle2 className="size-4" aria-hidden /> Ready — the report will be marked complete.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm">The report will be marked <span className="font-medium">incomplete</span> until these are resolved:</p>
                  <ul className="mt-2 space-y-1.5">
                    {issues.map((i) => (
                      <li key={i.key} className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">{i.label}</span>
                        <Link href={i.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                          {i.actionLabel}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {gen.pending && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Generating the {formatMonth(month)} report…
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <Link href={`/reports/${result.id}`}>View report</Link>
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gen.pending}>
                Cancel
              </Button>
              {months.length > 0 && (
                <Button onClick={() => gen.fire(month)} disabled={!month || gen.pending}>
                  {gen.pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {existing ? "Regenerate" : "Generate"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
