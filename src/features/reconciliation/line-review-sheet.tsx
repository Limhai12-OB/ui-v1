"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Link2, Loader2, Plus, StickyNote, Unlink, X } from "lucide-react";
import type { FinancialAccount, ID, Reconciliation, ReconLine, Transaction } from "@/types";
import { transactionEffect } from "@/lib/domain";
import { formatDate } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { reconciliationService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Money } from "@/components/shared/money";
import { StatusBadge } from "@/components/shared/status-badge";
import { AIBadge } from "@/components/shared/demo-notice";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/states";
import { Field } from "@/components/forms/field";
import { CategorySelect } from "@/components/forms/entity-selects";
import { cn } from "@/lib/utils";
import { guessCategory, isResolved, matchCandidates } from "./recon-utils";

interface Props {
  rec: Reconciliation;
  account: FinancialAccount;
  line: ReconLine | undefined;
  transactions: Transaction[];
  editable: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id of the next unresolved line after this one, if any. */
  nextPendingId?: ID;
  onSelect: (id: ID) => void;
}

export function LineReviewSheet({ rec, account, line, transactions, editable, onOpenChange, nextPendingId, onSelect }: Props) {
  return (
    <Sheet open={!!line} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {line && (
          <LineReview
            key={`${line.id}:${line.state}:${line.transactionId ?? ""}`}
            rec={rec}
            account={account}
            line={line}
            transactions={transactions}
            editable={editable}
            nextPendingId={nextPendingId}
            onSelect={onSelect}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LineReview({ rec, account, line, transactions, editable, nextPendingId, onSelect, onClose }: Omit<Props, "line" | "onOpenChange"> & { line: ReconLine; onClose: () => void }) {
  const cur = account.currency;
  const tx = line.transactionId ? transactions.find((t) => t.id === line.transactionId) : undefined;
  const resolved = isResolved(line);

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={line.state} />
          {line.state === "suggested" && line.matchConfidence !== undefined && <AIBadge label={`${Math.round(line.matchConfidence * 100)}% confidence`} />}
          {line.state === "unmatched" && line.note && <StatusBadge status="accepted" label="Reviewed" />}
        </div>
        <SheetTitle className="mt-2 font-mono text-sm">{line.description}</SheetTitle>
        <SheetDescription>
          {formatDate(line.date)} · <Money amount={line.amount} currency={cur} tone />
          {line.reference ? ` · Ref ${line.reference}` : ""}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 p-4">
        {line.state === "suggested" && <SuggestedBody rec={rec} line={line} tx={tx} account={account} editable={editable} />}
        {line.state === "discrepancy" && <DiscrepancyBody rec={rec} line={line} tx={tx} account={account} editable={editable} />}
        {line.state === "matched" && <MatchedBody rec={rec} line={line} tx={tx} account={account} editable={editable} />}
        {line.state === "unmatched" && <UnmatchedBody rec={rec} line={line} account={account} transactions={transactions} editable={editable} />}
        {!editable && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground" role="note">
            This reconciliation is {rec.status === "signed_off" ? "signed off" : "awaiting owner sign-off"} and can no longer be edited.
          </p>
        )}
      </div>

      <SheetFooter className="flex-row items-center justify-between border-t">
        <span className="text-xs text-muted-foreground" role="status">
          {resolved ? "This line is resolved." : "This line needs a decision."}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {nextPendingId && (
            <Button size="sm" variant="secondary" onClick={() => onSelect(nextPendingId)}>
              Next pending <ArrowRight />
            </Button>
          )}
        </div>
      </SheetFooter>
    </>
  );
}

/* ---------------- shared pieces ---------------- */

function useLineUpdate(rec: Reconciliation, line: ReconLine, success: string) {
  return useAction((patch: Partial<ReconLine>) => reconciliationService.updateLine(rec.id, line.id, patch), { success });
}

function Compare({ line, tx, account }: { line: ReconLine; tx?: Transaction; account: FinancialAccount }) {
  const { categoryName } = useLookups();
  const ledgerAmount = tx ? transactionEffect(tx, account.id) : undefined;
  const differs = ledgerAmount !== undefined && Math.abs(ledgerAmount - line.amount) >= 0.005;
  const row = (label: string, a: React.ReactNode, b: React.ReactNode, highlight?: boolean) => (
    <div className={cn("grid grid-cols-[88px_1fr_1fr] gap-3 px-3 py-2 text-sm", highlight && "bg-error-light/60")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{a}</dd>
      <dd className="min-w-0 break-words">{b}</dd>
    </div>
  );
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[88px_1fr_1fr] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span />
        <span>Bank statement</span>
        <span>Ledger record</span>
      </div>
      {tx ? (
        <dl className="divide-y">
          {row("Date", formatDate(line.date), formatDate(tx.date), line.date !== tx.date)}
          {row("Description", <span className="font-mono text-xs">{line.description}</span>, tx.description)}
          {row("Amount", <Money amount={line.amount} currency={account.currency} tone />, <Money amount={ledgerAmount!} currency={tx.currency} tone />, differs)}
          {row("Reference", line.reference ?? "—", tx.reference ?? "—", !!line.reference && !!tx.reference && line.reference !== tx.reference)}
          {row("Category", "—", tx.type === "transfer" ? "Transfer" : categoryName(tx.categoryId))}
        </dl>
      ) : (
        <p className="p-3 text-sm text-muted-foreground">The linked ledger record no longer exists.</p>
      )}
      {tx && (
        <div className="border-t px-3 py-2">
          <Link href={`/transactions/${tx.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Open ledger transaction <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}

function NoteBox({ id, label, value, onChange, helper }: { id: string; label: string; value: string; onChange: (v: string) => void; helper?: string }) {
  return (
    <Field label={label} htmlFor={id} required helper={helper}>
      <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} maxLength={280} />
    </Field>
  );
}

/* ---------------- suggested ---------------- */

function SuggestedBody({ rec, line, tx, account, editable }: { rec: Reconciliation; line: ReconLine; tx?: Transaction; account: FinancialAccount; editable: boolean }) {
  const accept = useLineUpdate(rec, line, "Match accepted");
  const reject = useLineUpdate(rec, line, "Suggestion rejected — line moved to unmatched");
  const busy = accept.pending || reject.pending;
  return (
    <>
      <p className="text-sm text-muted-foreground">The matching engine (simulated) linked this statement line to a ledger record. Confirm the match or reject it to find another record.</p>
      <Compare line={line} tx={tx} account={account} />
      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !tx} onClick={() => accept.fire({ state: "matched", matchConfidence: 1 })}>
            {accept.pending ? <Loader2 className="animate-spin" /> : <Check />} Accept match
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => reject.fire({ state: "unmatched", transactionId: undefined, matchConfidence: undefined, note: undefined })}>
            {reject.pending ? <Loader2 className="animate-spin" /> : <X />} Reject
          </Button>
        </div>
      )}
    </>
  );
}

/* ---------------- discrepancy ---------------- */

function DiscrepancyBody({ rec, line, tx, account, editable }: { rec: Reconciliation; line: ReconLine; tx?: Transaction; account: FinancialAccount; editable: boolean }) {
  const [note, setNote] = useState("");
  const accept = useLineUpdate(rec, line, "Statement amount accepted with note");
  const reject = useLineUpdate(rec, line, "Match removed — line moved to unmatched");
  const ledgerAmount = tx ? transactionEffect(tx, account.id) : 0;
  const diff = line.amount - ledgerAmount;
  const busy = accept.pending || reject.pending;
  return (
    <>
      <div className="flex items-start justify-between gap-3 rounded-lg border border-error/25 bg-error-light p-3 text-error-text">
        <div className="text-sm">
          <p className="font-medium">Statement differs from ledger</p>
          {line.note && <p className="mt-0.5 text-xs">{line.note}</p>}
        </div>
        <Money amount={diff} currency={account.currency} signed className="text-sm font-semibold" />
      </div>
      <Compare line={line} tx={tx} account={account} />
      {editable && (
        <>
          <Separator />
          <NoteBox id="disc-note" label="Explanation" value={note} onChange={setNote} helper="Required. Shown to the owner at sign-off, e.g. “ABA QR settlement fee deducted by bank”." />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || note.trim().length < 3} onClick={() => accept.fire({ state: "matched", note: note.trim() })}>
              {accept.pending ? <Loader2 className="animate-spin" /> : <Check />} Accept statement amount
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => reject.fire({ state: "unmatched", transactionId: undefined, matchConfidence: undefined, note: undefined })}>
              <Unlink /> Reject match
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- matched ---------------- */

function MatchedBody({ rec, line, tx, account, editable }: { rec: Reconciliation; line: ReconLine; tx?: Transaction; account: FinancialAccount; editable: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const unmatch = useLineUpdate(rec, line, "Line unmatched");
  return (
    <>
      {line.note && (
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>{line.note}</p>
        </div>
      )}
      {line.transactionId ? <Compare line={line} tx={tx} account={account} /> : <p className="text-sm text-muted-foreground">No ledger record linked.</p>}
      {editable && (
        <Button variant="outline" onClick={() => setConfirm(true)}>
          <Unlink /> Unmatch
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Unmatch this line?"
        description="The line returns to Unmatched and must be matched or explained again before you can submit. The ledger transaction itself is not changed or deleted."
        confirmLabel="Unmatch line"
        onConfirm={() => unmatch.run({ state: "unmatched", transactionId: undefined, matchConfidence: undefined, note: undefined })}
      />
    </>
  );
}

/* ---------------- unmatched ---------------- */

function UnmatchedBody({ rec, line, account, transactions, editable }: { rec: Reconciliation; line: ReconLine; account: FinancialAccount; transactions: Transaction[]; editable: boolean }) {
  const cur = account.currency;
  const candidates = useMemo(() => matchCandidates(line, rec, transactions), [line, rec, transactions]);
  const [categoryId, setCategoryId] = useState<string | undefined>(() => guessCategory(line));
  const [note, setNote] = useState(line.note ?? "");
  const [matchingId, setMatchingId] = useState<ID | null>(null);
  const kind = line.amount >= 0 ? "income" : "expense";
  const { categoryName } = useLookups();

  const match = useAction(
    (c: { tx: Transaction; effect: number; exact: boolean }) => {
      setMatchingId(c.tx.id);
      const diff = line.amount - c.effect;
      return reconciliationService.updateLine(rec.id, line.id, c.exact ? { state: "matched", transactionId: c.tx.id, matchConfidence: 1, note: undefined } : { state: "discrepancy", transactionId: c.tx.id, matchConfidence: 1, note: `Matched manually; statement differs from ledger by ${formatMoney(diff, cur, { signed: true })}.` });
    },
    { success: "Line matched to ledger transaction", onSuccess: () => setMatchingId(null) },
  );
  const createTx = useAction(() => reconciliationService.createTransactionFromLine(rec.id, line.id, categoryId!), { success: `Ledger ${kind} created and matched` });
  const review = useAction(() => reconciliationService.updateLine(rec.id, line.id, { note: note.trim() }), { success: "Line marked as reviewed" });

  if (!editable) {
    return line.note ? (
      <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
        <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p>{line.note}</p>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No ledger record was matched to this line.</p>
    );
  }

  return (
    <>
      <section aria-labelledby="cand-h" className="space-y-2">
        <h3 id="cand-h" className="text-sm font-medium">
          Match to an existing ledger transaction
        </h3>
        <p className="text-xs text-muted-foreground">Same account, within 3 days and 5% of the amount, not already used in this reconciliation.</p>
        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed">
            <EmptyState compact icon={Link2} title="No candidate transactions" description="Nothing in the ledger looks like this line. Create a ledger entry or explain it below." />
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {candidates.map((c) => (
              <li key={c.tx.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <Link href={`/transactions/${c.tx.id}`} className="block truncate font-medium hover:underline">
                    {c.tx.description}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(c.tx.date)} · {c.tx.type === "transfer" ? "Transfer" : categoryName(c.tx.categoryId)} · {c.exact ? "Exact amount" : "Amount within 5%"}
                    {c.dayGap > 0 ? ` · ${c.dayGap}d apart` : " · same day"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Money amount={c.effect} currency={c.tx.currency} tone className="text-sm" />
                  <Button size="sm" variant="outline" disabled={match.pending} onClick={() => match.fire(c)}>
                    {match.pending && matchingId === c.tx.id ? <Loader2 className="animate-spin" /> : <Link2 />} Match
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section aria-labelledby="create-h" className="space-y-3">
        <h3 id="create-h" className="text-sm font-medium">
          Create a ledger transaction
        </h3>
        <p className="text-xs text-muted-foreground">For bank-only items such as service charges or interest. Posts {kind === "expense" ? "an expense" : "income"} of <Money amount={Math.abs(line.amount)} currency={cur} /> to {account.name} on {formatDate(line.date)} and matches it.</p>
        <Field label={kind === "expense" ? "Expense category" : "Income category"} htmlFor="line-cat" required>
          <CategorySelect id="line-cat" kind={kind} value={categoryId} onChange={setCategoryId} />
        </Field>
        <Button disabled={!categoryId || createTx.pending} onClick={() => createTx.fire()}>
          {createTx.pending ? <Loader2 className="animate-spin" /> : <Plus />} Create ledger {kind}
        </Button>
      </section>

      <Separator />

      <section aria-labelledby="review-h" className="space-y-3">
        <h3 id="review-h" className="text-sm font-medium">
          Keep unmatched and explain
        </h3>
        <NoteBox id="line-note" label="Review note" value={note} onChange={setNote} helper="Required. The line stays unmatched but counts as reviewed for submission." />
        <Button variant="outline" disabled={note.trim().length < 3 || note.trim() === (line.note ?? "") || review.pending} onClick={() => review.fire()}>
          {review.pending ? <Loader2 className="animate-spin" /> : <StickyNote />} {line.note ? "Update note" : "Mark as reviewed"}
        </Button>
      </section>
    </>
  );
}
