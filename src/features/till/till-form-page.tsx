"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Calculator, Loader2, Lock, Save, Send, Undo2 } from "lucide-react";
import type { Currency, TillSession } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { useHydrated } from "@/hooks/use-hydrated";
import { tillService } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { BranchSelect } from "@/components/forms/entity-selects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, today } from "@/lib/date";
import { roundMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { KHR_NOTES, SHIFT_LABEL, SHIFT_OPTIONS, USD_NOTES, defaultFloats, denominationsFrom, expectedCash, varianceKind } from "./till-utils";
import { countedTotals, expectedTotals, noteRequirement, tillBaseSchema, tillSchema, type TillFormValues } from "./till-form-schema";
import { DenominationCounter } from "./denomination-counter";
import { DiffText, ExpectedBreakdown, VarianceBadge } from "./till-ui";

type SavePayload = Parameters<typeof tillService.save>[0];

export function TillNewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TillFormLoader />
    </Suspense>
  );
}

function TillFormLoader() {
  const params = useSearchParams();
  const sessionId = params.get("session") ?? undefined;
  const hydrated = useHydrated();
  const sessions = useAppStore((s) => s.tillSessions);
  const { inScope } = useScope();
  const { branchName } = useLookups();
  const session = sessionId ? sessions.find((s) => s.id === sessionId) : undefined;

  if (!hydrated) return <PageSkeleton />;

  if (sessionId && (!session || !inScope(session.branchId)))
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

  if (session && (session.status === "submitted" || session.status === "signed_off"))
    return (
      <>
        <PageHeader title="Edit till count" backHref={`/till-balancing/${session.id}`} backLabel="Back to count" />
        <EmptyState
          icon={Lock}
          title={session.status === "submitted" ? "This count is awaiting sign-off" : "This count has been signed off"}
          description={`The ${branchName(session.branchId)} count for ${formatDate(session.date)} is locked${session.status === "submitted" ? " until the owner signs it off or returns it for correction" : ""}. Signed-off and submitted counts can't be edited.`}
          action={
            <Button asChild>
              <Link href={`/till-balancing/${session.id}`}>View count</Link>
            </Button>
          }
        />
      </>
    );

  return <TillForm key={session?.id ?? "new"} session={session} />;
}

function initialValues(session: TillSession | undefined, branchId: string, floats: { usd: number; khr: number }): TillFormValues {
  if (!session)
    return {
      branchId,
      date: today(),
      shift: "full_day",
      openingFloatUSD: floats.usd,
      openingFloatKHR: floats.khr,
      usdCounts: USD_NOTES.map(() => 0),
      usdCoins: 0,
      khrCounts: KHR_NOTES.map(() => 0),
      cashInUSD: 0,
      cashInKHR: 0,
      notes: "",
    };
  const countOf = (c: Currency, v: number) => session.denominations.find((d) => d.currency === c && d.value === v)?.count ?? 0;
  const usdCounts = USD_NOTES.map((v) => countOf("USD", v));
  const notesUSD = USD_NOTES.reduce((s, v, i) => s + v * usdCounts[i], 0);
  // Older counts didn't itemise coins: carry any remainder into "Coins & cents" so the counted total is preserved.
  const coins = Math.max(0, roundMoney(session.countedUSD - notesUSD, "USD"));
  return {
    branchId: session.branchId,
    date: session.date,
    shift: session.shift,
    openingFloatUSD: session.openingFloatUSD,
    openingFloatKHR: session.openingFloatKHR,
    usdCounts,
    usdCoins: coins,
    khrCounts: KHR_NOTES.map((v) => countOf("KHR", v)),
    cashInUSD: 0,
    cashInKHR: 0,
    notes: session.notes ?? "",
  };
}

function TillForm({ session }: { session?: TillSession }) {
  const router = useRouter();
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const sessions = useAppStore((s) => s.tillSessions);
  const { branch, branches, user, isOwner } = useScope();
  const { accountName, branchName } = useLookups();
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startBranch = session?.branchId ?? (isOwner ? (branch?.id ?? branches.find((b) => b.status === "active")?.id ?? "") : (user.branchId ?? ""));
  const form = useForm<TillFormValues>({
    resolver: zodResolver(tillSchema),
    mode: "onChange",
    defaultValues: (() => {
      const init = initialValues(session, startBranch, defaultFloats(sessions, accounts, startBranch, today()));
      const e = expectedCash(accounts, transactions, init.branchId, init.date);
      return { ...init, cashInUSD: e.cashInUSD, cashInKHR: e.cashInKHR };
    })(),
  });
  const { control, register, handleSubmit, setValue, trigger, formState, watch } = form;
  const values = watch();

  const exp = useMemo(() => expectedCash(accounts, transactions, values.branchId, values.date), [accounts, transactions, values.branchId, values.date]);
  const counted = countedTotals(values);
  const expected = expectedTotals({ ...values, cashInUSD: exp.cashInUSD, cashInKHR: exp.cashInKHR });
  const diffUSD = roundMoney(counted.usd - expected.usd, "USD");
  const diffKHR = roundMoney(counted.khr - expected.khr, "KHR");
  const hasCounted = counted.usd > 0 || counted.khr > 0 || values.usdCounts.some((c) => c > 0) || values.khrCounts.some((c) => c > 0);
  const noteNeeded = noteRequirement(diffUSD, diffKHR);

  // Keep the ledger-derived cash-in figures in the form so validation can see them.
  useEffect(() => {
    setValue("cashInUSD", exp.cashInUSD, { shouldValidate: true });
    setValue("cashInKHR", exp.cashInKHR, { shouldValidate: true });
  }, [exp.cashInUSD, exp.cashInKHR, setValue]);

  // Re-validate the note whenever the variance changes (once the user has started counting).
  const touchedNotes = !!formState.touchedFields.notes;
  useEffect(() => {
    if (hasCounted || touchedNotes) void trigger("notes");
  }, [diffUSD, diffKHR, hasCounted, touchedNotes, trigger]);

  // New counts: default the float from the branch's previous count until the user edits it.
  const floatSource = useMemo(() => {
    const prev = sessions
      .filter((s) => s.branchId === values.branchId && s.id !== session?.id && s.date < (values.date || today()))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    return prev ? `From the ${formatDate(prev.date)} count` : "From the drawer's opening balance";
  }, [sessions, values.branchId, values.date, session?.id]);
  const dirtyFloatUSD = !!formState.dirtyFields.openingFloatUSD;
  const dirtyFloatKHR = !!formState.dirtyFields.openingFloatKHR;
  const lastKey = useRef(`${values.branchId}|${values.date}`);
  useEffect(() => {
    if (session) return;
    const key = `${values.branchId}|${values.date}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const f = defaultFloats(sessions, accounts, values.branchId, values.date);
    if (!dirtyFloatUSD) setValue("openingFloatUSD", f.usd, { shouldValidate: true });
    if (!dirtyFloatKHR) setValue("openingFloatKHR", f.khr, { shouldValidate: true });
  }, [session, values.branchId, values.date, sessions, accounts, dirtyFloatUSD, dirtyFloatKHR, setValue]);

  const duplicate = sessions.find((s) => s.id !== session?.id && s.branchId === values.branchId && s.date === values.date && s.shift === values.shift);
  const draftable = tillBaseSchema.safeParse({ ...values, cashInUSD: exp.cashInUSD, cashInKHR: exp.cashInKHR }).success;

  const save = useAction((p: SavePayload) => tillService.save(p), {
    success: (s) => (s.status === "submitted" ? "Till count submitted for sign-off" : "Draft saved"),
    onSuccess: (s) => {
      setSaved(true);
      router.push(`/till-balancing/${s.id}`);
    },
  });

  const payload = (submit: boolean): SavePayload => ({
    id: session?.id,
    submit,
    branchId: values.branchId,
    date: values.date,
    shift: values.shift,
    openingFloatUSD: roundMoney(values.openingFloatUSD, "USD"),
    openingFloatKHR: roundMoney(values.openingFloatKHR, "KHR"),
    expectedUSD: expected.usd,
    expectedKHR: expected.khr,
    countedUSD: counted.usd,
    countedKHR: counted.khr,
    denominations: denominationsFrom(values.usdCounts, values.usdCoins, values.khrCounts),
    notes: values.notes.trim() || undefined,
  });

  const resubmitting = session?.status === "returned";
  const title = resubmitting ? "Recount & resubmit" : session ? "Continue till count" : "Count till";
  const notesError = formState.errors.notes?.message;

  return (
    <>
      <PageHeader
        title={title}
        backHref={session ? `/till-balancing/${session.id}` : "/till-balancing"}
        backLabel={session ? "Back to count" : "Till balancing"}
        meta={session && <StatusBadge status={session.status} />}
        description="Count the cash in each drawer. Expected cash comes from the opening float plus cash income recorded today; USD and KHR are balanced separately."
      />
      <UnsavedChangesGuard when={formState.isDirty && !saved} />

      {resubmitting && session?.reviewNote && (
        <div role="note" className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
          <Undo2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Returned by {session.reviewedBy ?? "the owner"}</p>
            <p>{session.reviewNote}</p>
          </div>
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit(() => setConfirmOpen(true))}
        className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Count details</CardTitle>
              <CardDescription>Which drawer and shift you&apos;re counting.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Branch" htmlFor="till-branch" required error={formState.errors.branchId?.message} helper={session ? "Fixed for an existing count" : !isOwner ? "Your assigned branch" : undefined}>
                <Controller
                  control={control}
                  name="branchId"
                  render={({ field }) => <BranchSelect id="till-branch" value={field.value || undefined} onChange={field.onChange} disabled={!!session} aria-invalid={!!formState.errors.branchId} />}
                />
              </Field>
              <Field label="Date" htmlFor="till-date" required error={formState.errors.date?.message} helper={session ? "Fixed for an existing count" : undefined}>
                <Input id="till-date" type="date" max={today()} disabled={!!session} {...register("date")} aria-invalid={!!formState.errors.date} />
              </Field>
              <Field label="Shift" htmlFor="till-shift" required>
                <Controller
                  control={control}
                  name="shift"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="till-shift" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFT_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              {duplicate && (
                <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light px-3 py-2 text-sm text-warning-text sm:col-span-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    A {SHIFT_LABEL[duplicate.shift].toLowerCase()} count for {branchName(duplicate.branchId)} on {formatDate(duplicate.date)} already exists ({duplicate.status.replace("_", " ")}).{" "}
                    <Link href={duplicate.status === "draft" || duplicate.status === "returned" ? `/till-balancing/new?session=${duplicate.id}` : `/till-balancing/${duplicate.id}`} className="font-medium underline underline-offset-2">
                      {duplicate.status === "draft" || duplicate.status === "returned" ? "Continue that count instead" : "View existing count"}
                    </Link>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expected cash</CardTitle>
              <CardDescription>Opening float plus cash income recorded into this branch&apos;s cash drawers on {values.date ? formatDate(values.date) : "the selected date"}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Opening float (USD)" htmlFor="till-float-usd" required error={formState.errors.openingFloatUSD?.message} helper={session ? undefined : floatSource}>
                  <Controller
                    control={control}
                    name="openingFloatUSD"
                    render={({ field }) => (
                      <MoneyInput id="till-float-usd" currency="USD" value={Number.isFinite(field.value) ? field.value : ""} onValueChange={(v) => field.onChange(v === "" ? Number.NaN : v)} onBlur={field.onBlur} aria-invalid={!!formState.errors.openingFloatUSD} />
                    )}
                  />
                </Field>
                <Field label="Opening float (KHR)" htmlFor="till-float-khr" required error={formState.errors.openingFloatKHR?.message} helper={session ? undefined : floatSource}>
                  <Controller
                    control={control}
                    name="openingFloatKHR"
                    render={({ field }) => (
                      <MoneyInput id="till-float-khr" currency="KHR" value={Number.isFinite(field.value) ? field.value : ""} onValueChange={(v) => field.onChange(v === "" ? Number.NaN : v)} onBlur={field.onBlur} aria-invalid={!!formState.errors.openingFloatKHR} />
                    )}
                  />
                </Field>
              </div>
              <ExpectedBreakdown
                floatUSD={Number.isFinite(values.openingFloatUSD) ? values.openingFloatUSD : 0}
                floatKHR={Number.isFinite(values.openingFloatKHR) ? values.openingFloatKHR : 0}
                usdTx={exp.usdTx}
                khrTx={exp.khrTx}
                usdDrawers={exp.usdAccounts}
                khrDrawers={exp.khrAccounts}
                accountName={accountName}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-2">
            <DenominationCounter currency="USD" notes={USD_NOTES} control={control} counts={values.usdCounts} coins={values.usdCoins} total={counted.usd} />
            <DenominationCounter currency="KHR" notes={KHR_NOTES} control={control} counts={values.khrCounts} total={counted.khr} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
              <CardDescription>Explain any difference — e.g. a refund paid from the till or a sale not yet recorded.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field
                label="Count notes"
                htmlFor="till-notes"
                required={!!noteNeeded}
                error={notesError}
                helper={noteNeeded ? noteNeeded : "Optional while both drawers are within $2.00 / ៛8,000 of expected."}
              >
                <Textarea id="till-notes" rows={3} {...register("notes")} aria-invalid={!!notesError} aria-describedby={notesError ? "till-notes-error" : "till-notes-helper"} placeholder="What happened in this shift?" />
              </Field>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20" aria-label="Count summary">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
              <CardDescription>Live result per currency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4" aria-live="polite">
              <SummaryBlock currency="USD" expected={expected.usd} counted={counted.usd} diff={diffUSD} />
              <SummaryBlock currency="KHR" expected={expected.khr} counted={counted.khr} diff={diffKHR} />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={!formState.isValid || save.pending || !hasCounted}>
              <Send /> {resubmitting ? "Resubmit for sign-off" : "Submit for sign-off"}
            </Button>
            <Button type="button" variant="outline" disabled={!draftable || save.pending || (!!session && !formState.isDirty)} onClick={() => save.fire(payload(false))}>
              {save.pending ? <Loader2 className="animate-spin" /> : <Save />} Save draft
            </Button>
            {!hasCounted && <p className="text-xs text-muted-foreground">Enter at least one count to submit.</p>}
            {hasCounted && noteNeeded && notesError && <p className="text-xs text-muted-foreground">Add a note explaining the difference to submit. Drafts can be saved without one.</p>}
          </div>
        </aside>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={resubmitting ? "Resubmit till count?" : "Submit till count for sign-off?"}
        description={`${branchName(values.branchId)} · ${values.date ? formatDate(values.date) : ""} · ${SHIFT_LABEL[values.shift]}. The count is locked once submitted, until the owner signs it off or returns it.`}
        confirmLabel={resubmitting ? "Resubmit" : "Submit count"}
        onConfirm={() => save.run(payload(true))}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(["USD", "KHR"] as const).map((c) => (
            <div key={c} className="rounded-lg border p-3 text-sm">
              <p className="mb-2 font-medium">{c} drawer</p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Expected</dt>
                  <dd>
                    <Money amount={c === "USD" ? expected.usd : expected.khr} currency={c} />
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Counted</dt>
                  <dd>
                    <Money amount={c === "USD" ? counted.usd : counted.khr} currency={c} />
                  </dd>
                </div>
              </dl>
              <div className="mt-2">
                <VarianceBadge diff={c === "USD" ? diffUSD : diffKHR} currency={c} />
              </div>
            </div>
          ))}
        </div>
      </ConfirmDialog>
    </>
  );
}

function SummaryBlock({ currency, expected, counted, diff }: { currency: Currency; expected: number; counted: number; diff: number }) {
  const kind = varianceKind(diff, currency);
  return (
    <div className={cn("rounded-lg border p-3", kind === "short" && "border-error/30", kind === "over" && "border-warning/30", kind === "balanced" && "border-success/30")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{currency} drawer</p>
        <VarianceBadge diff={diff} currency={currency} showAmount={false} />
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Expected</dt>
          <dd>
            <Money amount={expected} currency={currency} />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Counted</dt>
          <dd>
            <Money amount={counted} currency={currency} />
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t pt-1 font-semibold">
          <dt>{kind === "over" ? "Over" : kind === "short" ? "Short" : "Difference"}</dt>
          <dd>
            <DiffText diff={diff} currency={currency} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
