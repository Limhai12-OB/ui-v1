"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowRight, FileSpreadsheet, Loader2 } from "lucide-react";
import type { ReconLine } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { reconciliationService } from "@/lib/api";
import { formatDate, formatMonth, monthKey, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { DemoNotice } from "@/components/shared/demo-notice";
import { EmptyState } from "@/components/shared/states";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field } from "@/components/forms/field";
import { DataTable } from "@/components/tables/data-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildStatement, isReconcilable, LINE_STATES, lineCounts, recentMonths } from "./recon-utils";

const schema = z.object({
  accountId: z.string().min(1, "Choose an account"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Choose a statement month"),
});
type FormValues = z.infer<typeof schema>;

export function NewReconciliationPage() {
  const router = useRouter();
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const reconciliations = useAppStore((s) => s.reconciliations);
  const { inScope } = useScope();
  const { branchName } = useLookups();
  const [saved, setSaved] = useState(false);

  const eligible = useMemo(() => accounts.filter((a) => isReconcilable(a) && inScope(a.branchId)), [accounts, inScope]);
  const months = useMemo(() => recentMonths(6), []);

  const { control, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: { accountId: eligible.length === 1 ? eligible[0].id : "", month: months[1] ?? months[0] },
  });
  const accountId = watch("accountId");
  const month = watch("month");
  const account = eligible.find((a) => a.id === accountId);
  const existing = account ? reconciliations.find((r) => r.accountId === account.id && monthKey(r.periodStart) === month) : undefined;

  const preview = useMemo(() => (account && month ? buildStatement(account, transactions, month) : undefined), [account, month, transactions]);
  const counts = preview ? lineCounts(preview.lines) : undefined;

  const create = useAction(
    async (): Promise<string> => {
      if (!account || !preview) throw new Error("Choose an account and month first.");
      const rec = await reconciliationService.create({
        accountId: account.id,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        statementOpening: preview.opening,
        statementClosing: preview.closing,
        lines: preview.lines,
      });
      return rec.id;
    },
    {
      success: "Reconciliation started",
      onSuccess: (id) => {
        setSaved(true);
        router.push(`/reconciliation/${id}`);
      },
    },
  );

  const columns = useMemo<ColumnDef<ReconLine, unknown>[]>(
    () => [
      { accessorKey: "date", header: "Date", cell: ({ row }) => <span className="whitespace-nowrap">{formatDate(row.original.date)}</span> },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="min-w-48">
            <p className="font-mono text-xs">{row.original.description}</p>
            {row.original.reference && <p className="text-xs text-muted-foreground">Ref {row.original.reference}</p>}
          </div>
        ),
      },
      { accessorKey: "state", header: "Auto-match", cell: ({ row }) => <StatusBadge status={row.original.state} /> },
      {
        accessorKey: "amount",
        header: "Amount",
        meta: { align: "right" },
        cell: ({ row }) => (account ? <Money amount={row.original.amount} currency={account.currency} tone /> : null),
      },
    ],
    [account],
  );

  const canCreate = formState.isValid && !!preview && preview.lines.length > 0 && !existing && !create.pending;

  return (
    <>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
      <PageHeader title="Start reconciliation" description="Pick a bank or e-wallet account and statement month. Statement lines are loaded and auto-matched against the ledger before you confirm." backHref="/reconciliation" backLabel="Reconciliation" />

      <form
        noValidate
        onSubmit={handleSubmit(() => create.fire())}
        className="grid gap-6 lg:grid-cols-[340px_1fr]"
      >
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Statement</CardTitle>
            <CardDescription>Only bank and e-wallet accounts in your scope can be reconciled.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Account" htmlFor="recon-account" required error={formState.errors.accountId?.message}>
              <Controller
                control={control}
                name="accountId"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="recon-account" className="w-full" aria-invalid={!!formState.errors.accountId}>
                      <SelectValue placeholder="Select bank or e-wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No bank or e-wallet accounts in scope</div>}
                      {eligible.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} <span className="text-muted-foreground">· {a.accountNumber} · {a.currency}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Statement month" htmlFor="recon-month" required error={formState.errors.month?.message}>
              <Controller
                control={control}
                name="month"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="recon-month" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => {
                        const taken = account && reconciliations.some((r) => r.accountId === account.id && monthKey(r.periodStart) === m);
                        return (
                          <SelectItem key={m} value={m}>
                            {formatMonth(m)}
                            {m === monthKey(today()) ? " (month to date)" : ""}
                            {taken ? " · already started" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {account && (
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Branch</dt>
                  <dd className="font-medium">{branchName(account.branchId)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd className="font-medium">{account.currency}</dd>
                </div>
              </dl>
            )}

            {existing && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light p-3 text-xs text-warning-text">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">A reconciliation for {formatMonth(month)} already exists.</p>
                  <p>Continue the existing one instead of starting a duplicate — returned reconciliations can be corrected and resubmitted.</p>
                  <Link href={`/reconciliation/${existing.id}`} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                    Open existing reconciliation <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row lg:flex-col">
              <Button type="submit" disabled={!canCreate}>
                {create.pending && <Loader2 className="animate-spin" />}
                Create reconciliation
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/reconciliation">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <DemoNotice>
            Statement lines below are built <strong>from imported statement lines (simulated)</strong>: the demo derives them from this account&apos;s ledger with a few
            realistic differences — fees, bank-only charges and lower-confidence matches. In production they come from the file you upload in{" "}
            <Link href="/banking/import" className="underline underline-offset-2">
              Banking › Import
            </Link>
            .
          </DemoNotice>

          {!account ? (
            <Card>
              <EmptyState icon={FileSpreadsheet} title="Choose an account" description="Select a bank or e-wallet account and a month to preview its statement lines." />
            </Card>
          ) : preview && preview.lines.length === 0 ? (
            <Card>
              <EmptyState icon={FileSpreadsheet} title={`No activity in ${formatMonth(month)}`} description={`${account.name} has no ledger transactions in this period, so there is no statement to reconcile. Choose another month.`} />
            </Card>
          ) : preview && counts ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="gap-1 p-4">
                  <p className="text-xs text-muted-foreground">Opening balance · {formatDate(preview.periodStart)}</p>
                  <Money amount={preview.opening} currency={account.currency} className="text-xl font-semibold" />
                </Card>
                <Card className="gap-1 p-4">
                  <p className="text-xs text-muted-foreground">Statement lines</p>
                  <p className="text-xl font-semibold tabular-nums">{preview.lines.length}</p>
                </Card>
                <Card className="gap-1 p-4">
                  <p className="text-xs text-muted-foreground">
                    Closing balance · {formatDate(preview.periodEnd)}
                    {preview.partial && " (to date)"}
                  </p>
                  <Money amount={preview.closing} currency={account.currency} className="text-xl font-semibold" />
                </Card>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Auto-match results">
                <span>Auto-match:</span>
                {LINE_STATES.map((s) => (
                  <StatusBadge key={s} status={s} label={`${counts[s]} ${s}`} />
                ))}
              </div>
              <Card className="gap-0 py-0">
                <DataTable columns={columns} data={preview.lines} searchPlaceholder="Search statement lines…" getRowId={(l) => l.id} pageSize={10} />
              </Card>
            </>
          ) : null}
        </div>
      </form>
    </>
  );
}
