"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, CheckCircle2, Loader2, ShieldCheck, Undo2 } from "lucide-react";
import type { Currency, TillSession } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { useHydrated } from "@/hooks/use-hydrated";
import { tillService } from "@/lib/api";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailList } from "@/components/shared/detail-list";
import { Field } from "@/components/forms/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { SHIFT_LABEL, VARIANCE_THRESHOLD, expectedCash, exceedsThreshold, tillDiff, varianceKind } from "./till-utils";
import { DenominationTable, DiffText, ExpectedBreakdown, HistoryTimeline, VarianceBadge } from "./till-ui";

function CurrencySummary({ session, currency }: { session: TillSession; currency: Currency }) {
  const expected = currency === "USD" ? session.expectedUSD : session.expectedKHR;
  const counted = currency === "USD" ? session.countedUSD : session.countedKHR;
  const diff = tillDiff(session, currency);
  const kind = varianceKind(diff, currency);
  return (
    <Card className={cn("gap-3 p-5", kind === "short" && "border-error/30", kind === "over" && "border-warning/30")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{currency === "USD" ? "USD drawer" : "KHR drawer"}</h2>
        <VarianceBadge diff={diff} currency={currency} showAmount={false} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Expected</p>
          <Money amount={expected} currency={currency} className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Counted</p>
          <Money amount={counted} currency={currency} className="text-lg font-semibold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{kind === "over" ? "Over" : kind === "short" ? "Short" : "Difference"}</p>
          <DiffText diff={diff} currency={currency} className="text-lg font-semibold" />
        </div>
      </div>
      {exceedsThreshold(diff, currency) && <p className="text-xs text-muted-foreground">Outside the {formatMoney(VARIANCE_THRESHOLD[currency], currency)} tolerance, so a note was required.</p>}
    </Card>
  );
}

export function TillDetailPage({ id }: { id: string }) {
  const hydrated = useHydrated();
  const session = useAppStore((s) => s.tillSessions.find((t) => t.id === id));
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const { inScope } = useScope();
  const { branchName, accountName } = useLookups();
  const canSignOff = useCan("till.signoff");
  const [signOpen, setSignOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [signNote, setSignNote] = useState("");
  const [returnNote, setReturnNote] = useState("");

  const exp = useMemo(() => expectedCash(accounts, transactions, session?.branchId, session?.date), [accounts, transactions, session?.branchId, session?.date]);

  const signOff = useAction((note?: string) => tillService.signOff(id, note), { success: "Till count signed off" });
  const giveBack = useAction((note: string) => tillService.returnForCorrection(id, note), {
    success: "Returned to the branch for correction",
    onSuccess: () => {
      setReturnOpen(false);
      setReturnNote("");
    },
  });

  if (!hydrated) return <PageSkeleton />;
  if (!session || !inScope(session.branchId))
    return (
      <EmptyState
        icon={Calculator}
        title="Till count not found"
        description="It may have been removed, or it belongs to a branch you don't have access to."
        action={
          <Button asChild>
            <Link href="/till-balancing">Back to till balancing</Link>
          </Button>
        }
      />
    );

  const returnValid = returnNote.trim().length >= 5;
  const editHref = `/till-balancing/new?session=${session.id}`;

  return (
    <>
      <PageHeader
        title={`${branchName(session.branchId)} · ${formatDate(session.date)}`}
        meta={<StatusBadge status={session.status} />}
        backHref="/till-balancing"
        backLabel="Till balancing"
        description={`${SHIFT_LABEL[session.shift]} till count by ${session.submittedBy}${session.submittedAt ? `, submitted ${formatDateTime(session.submittedAt)}` : ""}.`}
        actions={
          <>
            {session.status === "draft" && (
              <Button asChild>
                <Link href={editHref}>
                  <Calculator /> Continue count
                </Link>
              </Button>
            )}
            {session.status === "returned" && (
              <Button asChild>
                <Link href={editHref}>
                  <Calculator /> Recount & resubmit
                </Link>
              </Button>
            )}
            {session.status === "submitted" && canSignOff && (
              <>
                <Button variant="outline" onClick={() => setReturnOpen(true)}>
                  <Undo2 /> Return for correction
                </Button>
                <Button onClick={() => setSignOpen(true)}>
                  <ShieldCheck /> Sign off
                </Button>
              </>
            )}
          </>
        }
      />

      {session.status === "returned" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
          <Undo2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              Returned for correction by {session.reviewedBy ?? "the owner"}
              {session.reviewedAt ? ` · ${formatDateTime(session.reviewedAt)}` : ""}
            </p>
            {session.reviewNote && <p className="mt-0.5">{session.reviewNote}</p>}
          </div>
        </div>
      )}
      {session.status === "signed_off" && (
        <div role="note" className="mb-6 flex items-start gap-3 rounded-xl border border-success/30 bg-success-light px-4 py-3 text-sm text-success-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              Signed off by {session.reviewedBy ?? "the owner"}
              {session.reviewedAt ? ` · ${formatDateTime(session.reviewedAt)}` : ""}
            </p>
            {session.reviewNote && <p className="mt-0.5">{session.reviewNote}</p>}
          </div>
        </div>
      )}
      {session.status === "submitted" && (
        <div role="note" className="mb-6 flex items-start gap-3 rounded-xl border border-info/30 bg-info-light px-4 py-3 text-sm text-info-text">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{canSignOff ? "Review both drawers below, then sign off or return the count to the branch." : "Awaiting sign-off from the Business Owner. The count is locked until it's reviewed."}</p>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <CurrencySummary session={session} currency="USD" />
        <CurrencySummary session={session} currency="KHR" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionHeader title="Expected cash" description="Opening float plus cash income recorded into the branch's drawers on this date." />
            <ExpectedBreakdown
              floatUSD={session.openingFloatUSD}
              floatKHR={session.openingFloatKHR}
              usdTx={exp.usdTx}
              khrTx={exp.khrTx}
              usdDrawers={exp.usdAccounts}
              khrDrawers={exp.khrAccounts}
              accountName={accountName}
              storedUSD={session.expectedUSD}
              storedKHR={session.expectedKHR}
            />
          </section>
          <section>
            <SectionHeader title="Cash counted" description="Denominations counted in each drawer." />
            <div className="grid gap-4 lg:grid-cols-2">
              <DenominationTable session={session} currency="USD" />
              <DenominationTable session={session} currency="KHR" />
            </div>
          </section>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: "Branch", value: branchName(session.branchId) },
                  { label: "Date", value: formatDate(session.date) },
                  { label: "Shift", value: SHIFT_LABEL[session.shift] },
                  { label: "Opening float", value: <span className="flex flex-wrap gap-x-3"><Money amount={session.openingFloatUSD} currency="USD" /><Money amount={session.openingFloatKHR} currency="KHR" /></span> },
                  { label: "Counted by", value: session.submittedBy },
                  { label: "Notes", value: session.notes ? <span className="whitespace-pre-wrap">{session.notes}</span> : <span className="text-muted-foreground">No notes</span> },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryTimeline history={session.history} />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={signOpen}
        onOpenChange={(o) => {
          setSignOpen(o);
          if (!o) setSignNote("");
        }}
        title="Sign off this till count?"
        description={`${branchName(session.branchId)} · ${formatDate(session.date)}. Signing off accepts both drawer results as final.`}
        confirmLabel="Sign off"
        onConfirm={() => signOff.run(signNote.trim() || undefined)}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5">
              USD <VarianceBadge diff={tillDiff(session, "USD")} currency="USD" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              KHR <VarianceBadge diff={tillDiff(session, "KHR")} currency="KHR" />
            </span>
          </div>
          <Field label="Note (optional)" htmlFor="till-sign-note">
            <Textarea id="till-sign-note" rows={2} value={signNote} onChange={(e) => setSignNote(e.target.value)} placeholder="e.g. Shortfall accepted — refund receipt seen." maxLength={300} />
          </Field>
        </div>
      </ConfirmDialog>

      <Dialog open={returnOpen} onOpenChange={(o) => !giveBack.pending && setReturnOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (returnValid) giveBack.fire(returnNote.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle>Return for correction</DialogTitle>
              <DialogDescription>The branch will be asked to recount and resubmit. Tell them what to check.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Field label="Reason" htmlFor="till-return-note" required error={returnNote.length > 0 && !returnValid ? "Enter at least 5 characters so the branch knows what to fix." : undefined} helper="Required — shown to the branch manager.">
                <Textarea id="till-return-note" rows={3} autoFocus value={returnNote} onChange={(e) => setReturnNote(e.target.value)} maxLength={300} aria-invalid={returnNote.length > 0 && !returnValid} placeholder="e.g. Recount the $1 notes and check for an unrecorded sale." />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnOpen(false)} disabled={giveBack.pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!returnValid || giveBack.pending}>
                {giveBack.pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Return count
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
