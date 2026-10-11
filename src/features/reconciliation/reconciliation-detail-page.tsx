"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, CheckCircle2, ChevronRight, Clock, GitCompareArrows, Info, Loader2, Send, ShieldCheck, Undo2 } from "lucide-react";
import type { ID, ReconLine, ReconLineState } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { useHydrated } from "@/hooks/use-hydrated";
import { reconciliationService } from "@/lib/api";
import { formatDate, formatDateTime, formatMonth, monthKey } from "@/lib/date";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Steps } from "@/components/shared/steps";
import { AIBadge } from "@/components/shared/demo-notice";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Field } from "@/components/forms/field";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { currentStep, isEditable, LINE_STATES, lineCounts, pendingLines, RECON_STEPS, reconSummary } from "./recon-utils";
import { LineReviewSheet } from "./line-review-sheet";

type Filter = "all" | "pending" | ReconLineState;

export function ReconciliationDetailPage({ id }: { id: string }) {
  const hydrated = useHydrated();
  const rec = useAppStore((s) => s.reconciliations.find((r) => r.id === id));
  const transactions = useAppStore((s) => s.transactions);
  const { inScope } = useScope();
  const { account: getAccount, branchName } = useLookups();
  const canSignOff = useCan("reconciliation.signoff");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [note, setNote] = useState("");

  const account = getAccount(rec?.accountId);
  const summary = useMemo(() => (rec && account ? reconSummary(rec, account, transactions) : undefined), [rec, account, transactions]);
  const txById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);

  const submit = useAction((n?: string) => reconciliationService.submit(id, n), { success: "Submitted for owner sign-off" });
  const signOff = useAction((n?: string) => reconciliationService.signOff(id, n), { success: "Reconciliation signed off" });
  const sendBack = useAction((n: string) => reconciliationService.returnForCorrection(id, n), { success: "Returned for correction" });

  const lines = useMemo(() => (rec ? [...rec.lines].sort((a, b) => a.date.localeCompare(b.date)) : []), [rec]);
  const pending = useMemo(() => pendingLines(lines), [lines]);
  const counts = useMemo(() => lineCounts(lines), [lines]);
  const visible = useMemo(() => (filter === "all" ? lines : filter === "pending" ? pending : lines.filter((l) => l.state === filter)), [filter, lines, pending]);

  const cur = account?.currency ?? "USD";
  const columns = useMemo<ColumnDef<ReconLine, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        meta: { label: "Date" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span>,
      },
      {
        accessorKey: "description",
        header: "Statement description",
        meta: { label: "Description" },
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-mono text-xs">{row.original.description}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.reference ? `Ref ${row.original.reference}` : "No reference"}
              {row.original.note ? " · has note" : ""}
            </p>
          </div>
        ),
      },
      {
        id: "ledger",
        accessorFn: (l) => (l.transactionId ? (txById.get(l.transactionId)?.description ?? "") : ""),
        header: "Ledger record",
        meta: { label: "Ledger record" },
        cell: ({ row }) => {
          const tx = row.original.transactionId ? txById.get(row.original.transactionId) : undefined;
          return tx ? <span className="line-clamp-1 max-w-56 text-sm">{tx.description}</span> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        accessorKey: "state",
        header: "State",
        meta: { label: "State" },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge status={row.original.state} />
            {row.original.state === "suggested" && row.original.matchConfidence !== undefined && <AIBadge label={`${Math.round(row.original.matchConfidence * 100)}%`} />}
            {row.original.state === "unmatched" && row.original.note && <StatusBadge status="accepted" label="Reviewed" />}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />,
        meta: { align: "right", label: "Amount" },
        cell: ({ row }) => <Money amount={row.original.amount} currency={cur} tone />,
      },
      {
        id: "open",
        enableHiding: false,
        header: () => <span className="sr-only">Review</span>,
        meta: { align: "right" },
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Review line ${row.original.description}`}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.original.id);
            }}
          >
            <ChevronRight />
          </Button>
        ),
      },
    ],
    [txById, cur],
  );

  if (!hydrated) return <PageSkeleton />;
  if (!rec || !account || !summary || !inScope(rec.branchId)) {
    return (
      <EmptyState
        icon={GitCompareArrows}
        title="Reconciliation not found"
        description="It may have been removed, or it belongs to a branch you don't have access to."
        action={
          <Button asChild>
            <Link href="/reconciliation">Back to reconciliation</Link>
          </Button>
        }
      />
    );
  }

  const editable = isEditable(rec);
  const selected = selectedId ? lines.find((l) => l.id === selectedId) : undefined;
  const nextPending = selected ? (pending.find((l) => l.id !== selected.id && l.date >= selected.date) ?? pending.find((l) => l.id !== selected.id)) : undefined;
  const month = monthKey(rec.periodStart);
  const archived = rec.lines.length === 0;
  const blockReason =
    counts.suggested > 0
      ? `Accept or reject ${counts.suggested} suggested ${counts.suggested === 1 ? "match" : "matches"} first.`
      : counts.discrepancy > 0
        ? `Resolve ${counts.discrepancy} ${counts.discrepancy === 1 ? "discrepancy" : "discrepancies"} first.`
        : pending.length > 0
          ? `Match or explain ${pending.length} unmatched ${pending.length === 1 ? "line" : "lines"} first.`
          : archived
            ? "There are no statement lines to submit."
            : null;
  const diffNonZero = Math.abs(summary.difference) >= 0.005;
  const unexplained = Math.abs(summary.difference - summary.explainedDifference) >= 0.005;

  const openNote = (setter: (o: boolean) => void) => {
    setNote("");
    setter(true);
  };

  return (
    <>
      <PageHeader
        backHref="/reconciliation"
        backLabel="Reconciliation"
        title={`${account.name} · ${formatMonth(month)}`}
        meta={<StatusBadge status={rec.status} />}
        description={
          <>
            {account.accountNumber} · {branchName(rec.branchId)} · {formatDate(rec.periodStart)} – {formatDate(rec.periodEnd)} · {account.currency}
          </>
        }
        actions={
          <>
            {editable && (
              <div className="flex flex-col items-end gap-1">
                <Button onClick={() => openNote(setSubmitOpen)} disabled={!!blockReason} aria-describedby={blockReason ? "submit-reason" : undefined}>
                  <Send /> {rec.status === "returned" ? "Resubmit for review" : "Submit for review"}
                </Button>
              </div>
            )}
            {rec.status === "submitted" && canSignOff && (
              <>
                <Button variant="outline" onClick={() => openNote(setReturnOpen)}>
                  <Undo2 /> Return for correction
                </Button>
                <Button onClick={() => openNote(setSignOpen)}>
                  <ShieldCheck /> Sign off
                </Button>
              </>
            )}
          </>
        }
      />

      {editable && blockReason && (
        <p id="submit-reason" className="-mt-4 mb-4 flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
          <Info className="size-3.5" aria-hidden /> {blockReason}
        </p>
      )}

      <StatusBanner rec={rec} canSignOff={canSignOff} />

      <Card className="mb-6 p-4">
        <Steps steps={RECON_STEPS} current={currentStep(rec)} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Summary */}
          <section aria-labelledby="summary-h">
            <h2 id="summary-h" className="sr-only">
              Summary
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label={`Statement opening · ${formatDate(rec.periodStart, "dd MMM")}`}>
                <Money amount={summary.opening} currency={cur} />
              </Tile>
              <Tile label={`Statement closing · ${formatDate(rec.periodEnd, "dd MMM")}`}>
                <Money amount={summary.closing} currency={cur} />
              </Tile>
              <Tile label="Statement lines total">
                {archived ? <span className="text-muted-foreground">—</span> : <Money amount={summary.statementTotal} currency={cur} tone />}
                {!archived && (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    vs <Money amount={summary.matchedLedgerTotal} currency={cur} signed /> matched in ledger
                  </span>
                )}
              </Tile>
              <Tile label="Difference" highlight={!archived && diffNonZero ? "error" : !archived ? "success" : undefined}>
                {archived ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {diffNonZero ? null : <CheckCircle2 className="size-5 text-success-text" aria-hidden />}
                    <Money amount={summary.difference} currency={cur} signed={diffNonZero} />
                  </span>
                )}
                {!archived && (
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {!diffNonZero ? "Statement fully matched to ledger" : unexplained ? "From unmatched lines and amount differences" : "Explained by notes on accepted lines"}
                  </span>
                )}
              </Tile>
            </div>
            {summary.derived && <p className="mt-2 text-xs text-muted-foreground">Opening balance taken from the ledger the day before the period; closing = opening + statement lines.</p>}
          </section>

          {/* Lines */}
          <section aria-labelledby="lines-h">
            <SectionHeader
              title={<span id="lines-h">Statement lines</span>}
              description={archived ? undefined : `${lines.length} lines · ${counts.matched} matched · ${pending.length} need attention`}
              actions={
                !archived && (
                  <div className="flex flex-wrap gap-1.5" aria-label="Filter by state">
                    {LINE_STATES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFilter(filter === s ? "all" : s)}
                        aria-pressed={filter === s}
                        className={cn("rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", filter === s && "ring-2 ring-primary/50")}
                      >
                        <StatusBadge status={s} label={`${counts[s]} ${s}`} />
                      </button>
                    ))}
                  </div>
                )
              }
            />
            {archived ? (
              <Card>
                <EmptyState
                  icon={Archive}
                  title="Statement lines archived"
                  description={`This reconciliation was signed off${rec.reviewedBy ? ` by ${rec.reviewedBy}` : ""}${rec.reviewedAt ? ` on ${formatDate(rec.reviewedAt)}` : ""}. Line-level detail is no longer kept in the demo; the summary and activity history remain available.`}
                />
              </Card>
            ) : (
              <>
                <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-3">
                  <TabsList className="flex-wrap">
                    <TabsTrigger value="all">All ({lines.length})</TabsTrigger>
                    <TabsTrigger value="pending">Needs attention ({pending.length})</TabsTrigger>
                    {LINE_STATES.map((s) => (
                      <TabsTrigger key={s} value={s} className="capitalize">
                        {s} ({counts[s]})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Card className="gap-0 py-0">
                  <DataTable
                    key={filter}
                    columns={columns}
                    data={visible}
                    getRowId={(l) => l.id}
                    onRowClick={(l) => setSelectedId(l.id)}
                    searchPlaceholder="Search description or reference…"
                    searchFn={(l, q) => `${l.description} ${l.reference ?? ""} ${l.note ?? ""}`.toLowerCase().includes(q)}
                    initialSorting={[{ id: "date", desc: false }]}
                    initialHidden={["ledger"]}
                    pageSize={20}
                    empty={
                      <EmptyState
                        compact
                        icon={CheckCircle2}
                        title={filter === "pending" ? "Nothing needs attention" : "No lines in this state"}
                        description={filter === "pending" ? (editable ? "Every line is matched or explained. You can submit for owner sign-off." : "Every line is matched or explained.") : undefined}
                      />
                    }
                  />
                </Card>
              </>
            )}
          </section>
        </div>

        {/* Side column */}
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Prepared / submitted by" value={rec.submittedBy ? `${rec.submittedBy} · ${formatDateTime(rec.submittedAt)}` : "Not submitted yet"} />
              <Row label="Owner review" value={rec.reviewedBy ? `${rec.reviewedBy} · ${formatDateTime(rec.reviewedAt)}` : "Pending"} />
              {rec.reviewNote && <Row label="Review note" value={rec.reviewNote} />}
              <Row label="Ledger balance at period end" value={<Money amount={summary.ledgerClosing} currency={cur} />} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-4">
                {[...rec.history].reverse().map((h, i) => (
                  <li key={`${h.at}-${i}`} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden />
                    <p className="text-sm font-medium">{h.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.by} · {formatDateTime(h.at)}
                    </p>
                    {h.note && <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs">“{h.note}”</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>

      <LineReviewSheet
        rec={rec}
        account={account}
        line={selected}
        transactions={transactions}
        editable={editable}
        nextPendingId={nextPending?.id}
        onSelect={setSelectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />

      <ConfirmDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        title="Submit for owner sign-off?"
        description={`All ${lines.length} statement lines are matched or explained. The reconciliation becomes read-only until the owner signs it off or returns it.`}
        confirmLabel="Submit for review"
        onConfirm={() => submit.run(note.trim() || undefined)}
      >
        <Field label="Note for the owner (optional)" htmlFor="submit-note">
          <Textarea id="submit-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="e.g. Service charge booked; interest credit explained." />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Sign off this reconciliation?"
        description={
          <>
            Confirms {account.name} for {formatMonth(month)} is reconciled
            {diffNonZero ? <> with a difference of {<Money amount={summary.difference} currency={cur} signed />} explained in line notes</> : ""}. Matched ledger transactions are marked reconciled.
          </>
        }
        confirmLabel="Sign off"
        onConfirm={() => signOff.run(note.trim() || undefined)}
      >
        <Field label="Sign-off note (optional)" htmlFor="signoff-note">
          <Textarea id="signoff-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
        </Field>
      </ConfirmDialog>

      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} note={note} setNote={setNote} pending={sendBack.pending} onConfirm={() => sendBack.run(note.trim())} />
    </>
  );
}

function Tile({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: "error" | "success" }) {
  return (
    <Card className={cn("gap-1 p-4", highlight === "error" && "border-error/30 bg-error-light/40", highlight === "success" && "border-success/30 bg-success-light/40")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn("text-xl font-semibold tracking-tight tabular-nums", highlight === "error" && "text-error-text")}>{children}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function StatusBanner({ rec, canSignOff }: { rec: { status: string; reviewNote?: string; reviewedBy?: string; reviewedAt?: string; submittedBy?: string; submittedAt?: string }; canSignOff: boolean }) {
  if (rec.status === "returned") {
    return (
      <Banner tone="warning" icon={Undo2} title={`Returned for correction${rec.reviewedBy ? ` by ${rec.reviewedBy}` : ""}`}>
        {rec.reviewNote ? <>“{rec.reviewNote}”</> : "Review the lines, correct them and resubmit."} The reconciliation is editable again.
      </Banner>
    );
  }
  if (rec.status === "submitted") {
    return canSignOff ? (
      <Banner tone="info" icon={ShieldCheck} title="Ready for your sign-off">
        Submitted by {rec.submittedBy ?? "a team member"} on {formatDateTime(rec.submittedAt)}. Review the lines and notes, then sign off or return it for correction.
      </Banner>
    ) : (
      <Banner tone="info" icon={Clock} title="Awaiting owner sign-off">
        Submitted by {rec.submittedBy ?? "a team member"} on {formatDateTime(rec.submittedAt)}. The Business Owner will review it; it is read-only in the meantime.
      </Banner>
    );
  }
  if (rec.status === "signed_off") {
    return (
      <Banner tone="success" icon={ShieldCheck} title={`Signed off${rec.reviewedBy ? ` by ${rec.reviewedBy}` : ""} on ${formatDateTime(rec.reviewedAt)}`}>
        {rec.reviewNote ? <>“{rec.reviewNote}” </> : null}This reconciliation is closed and read-only.
      </Banner>
    );
  }
  return null;
}

function Banner({ tone, icon: Icon, title, children }: { tone: "info" | "warning" | "success"; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-xl border p-4",
        tone === "info" && "border-info/25 bg-info-light text-info-text",
        tone === "warning" && "border-warning/30 bg-warning-light text-warning-text",
        tone === "success" && "border-success/30 bg-success-light text-success-text",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-sm">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs">{children}</p>
      </div>
    </div>
  );
}

function ReturnDialog({ open, onOpenChange, note, setNote, pending, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; note: string; setNote: (v: string) => void; pending: boolean; onConfirm: () => Promise<unknown> }) {
  const valid = note.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onConfirm()
              .then(() => onOpenChange(false))
              .catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Return for correction</DialogTitle>
            <DialogDescription>The preparer will see your note and can edit and resubmit the reconciliation.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Field label="What needs to be corrected?" htmlFor="return-note" required helper="At least 5 characters." error={note.length > 0 && !valid ? "Add a little more detail" : undefined}>
              <Textarea id="return-note" rows={4} autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} aria-invalid={note.length > 0 && !valid} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!valid || pending}>
              {pending && <Loader2 className="animate-spin" />}
              Return for correction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

