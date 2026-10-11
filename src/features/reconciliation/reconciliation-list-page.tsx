"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, GitCompareArrows, Plus, ShieldCheck } from "lucide-react";
import type { Reconciliation } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatDate, formatMonth, monthKey } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { lineCounts } from "./recon-utils";

interface Row {
  rec: Reconciliation;
  id: string;
  accountId: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
  month: string;
  status: Reconciliation["status"];
  matchedPct: number | null;
  discrepancies: number;
  pending: number;
}

const STATUS_OPTIONS = [
  { value: "in_progress", label: "In progress" },
  { value: "returned", label: "Returned" },
  { value: "submitted", label: "Awaiting sign-off" },
  { value: "signed_off", label: "Signed off" },
];

export function ReconciliationListPage() {
  const router = useRouter();
  const loading = useInitialLoad();
  const reconciliations = useAppStore((s) => s.reconciliations);
  const { inScope } = useScope();
  const canSignOff = useCan("reconciliation.signoff");
  const { account, branchName } = useLookups();

  const rows = useMemo<Row[]>(
    () =>
      reconciliations
        .filter((r) => inScope(r.branchId))
        .map((r) => {
          const acc = account(r.accountId);
          const c = lineCounts(r.lines);
          return {
            rec: r,
            id: r.id,
            accountId: r.accountId,
            accountName: acc?.name ?? "Unknown account",
            accountNumber: acc?.accountNumber ?? "",
            branchName: branchName(r.branchId),
            month: monthKey(r.periodStart),
            status: r.status,
            matchedPct: r.lines.length ? c.matched / r.lines.length : r.status === "signed_off" ? 1 : null,
            discrepancies: c.discrepancy,
            pending: c.suggested + c.discrepancy + r.lines.filter((l) => l.state === "unmatched" && !l.note).length,
          };
        }),
    [reconciliations, inScope, account, branchName],
  );

  const awaiting = rows.filter((r) => r.status === "submitted");
  const accountOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.accountId, r.accountName);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "account",
        accessorFn: (r) => r.accountId,
        header: "Account",
        meta: { label: "Account" },
        enableHiding: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/reconciliation/${row.original.id}`} className="font-medium hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => e.stopPropagation()}>
              {row.original.accountName}
            </Link>
            <p className="text-xs text-muted-foreground tabular-nums">{row.original.accountNumber}</p>
          </div>
        ),
      },
      {
        id: "period",
        accessorFn: (r) => r.month,
        header: ({ column }) => <SortHeader column={column} title="Period" />,
        meta: { label: "Period" },
        cell: ({ row }) => <span className="whitespace-nowrap">{formatMonth(row.original.month)}</span>,
      },
      { id: "branch", accessorFn: (r) => r.branchName, header: "Branch", meta: { label: "Branch" } },
      {
        id: "status",
        accessorFn: (r) => r.status,
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "matched",
        accessorFn: (r) => r.matchedPct ?? -1,
        header: ({ column }) => <SortHeader column={column} title="Matched" />,
        meta: { label: "Matched" },
        cell: ({ row }) => {
          const pct = row.original.matchedPct;
          if (pct === null) return <span className="text-muted-foreground">—</span>;
          const v = Math.round(pct * 100);
          return (
            <div className="flex min-w-32 items-center gap-2">
              <Progress value={v} className="h-1.5 w-20" aria-label={`${v}% of statement lines matched`} />
              <span className="text-xs tabular-nums">{v}%</span>
              {row.original.rec.lines.length === 0 && <span className="text-xs text-muted-foreground">(archived)</span>}
            </div>
          );
        },
      },
      {
        id: "discrepancies",
        accessorFn: (r) => r.discrepancies,
        header: ({ column }) => <SortHeader column={column} title="Discrepancies" align="right" />,
        meta: { align: "right", label: "Discrepancies" },
        cell: ({ row }) =>
          row.original.discrepancies > 0 ? (
            <span className="font-medium text-error-text">{row.original.discrepancies}</span>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        id: "submitted",
        accessorFn: (r) => r.rec.submittedAt ?? "",
        header: ({ column }) => <SortHeader column={column} title="Submitted" />,
        meta: { label: "Submitted" },
        cell: ({ row }) =>
          row.original.rec.submittedBy ? (
            <div className="text-sm">
              <p>{row.original.rec.submittedBy}</p>
              <p className="text-xs text-muted-foreground">{formatDate(row.original.rec.submittedAt)}</p>
            </div>
          ) : (
            <span className="text-muted-foreground">Not submitted</span>
          ),
      },
      {
        id: "open",
        enableHiding: false,
        header: () => <span className="sr-only">Open</span>,
        meta: { align: "right" },
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/reconciliation/${row.original.id}`} aria-label={`Open reconciliation for ${row.original.accountName}, ${formatMonth(row.original.month)}`} onClick={(e) => e.stopPropagation()}>
              <ArrowRight />
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Bank reconciliation"
        description="Match each bank and e-wallet statement to the ledger, explain differences, and get the owner's sign-off for the month."
        actions={
          <Button asChild>
            <Link href="/reconciliation/new">
              <Plus /> Start reconciliation
            </Link>
          </Button>
        }
      />

      {!loading && canSignOff && awaiting.length > 0 && (
        <div role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-light p-4 text-warning-text sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium">
                {awaiting.length === 1 ? "1 reconciliation awaits your sign-off" : `${awaiting.length} reconciliations await your sign-off`}
              </p>
              <p className="text-xs">
                {awaiting
                  .slice(0, 3)
                  .map((r) => `${r.accountName} · ${formatMonth(r.month)}${r.rec.submittedBy ? ` (submitted by ${r.rec.submittedBy})` : ""}`)
                  .join("; ")}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 bg-card" asChild>
            <Link href={`/reconciliation/${awaiting[0].id}`}>
              Review {awaiting.length > 1 ? "first" : "now"} <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/reconciliation/${r.id}`)}
          searchPlaceholder="Search account, branch, period…"
          searchFn={(r, q) => `${r.accountName} ${r.accountNumber} ${r.branchName} ${formatMonth(r.month)} ${r.rec.submittedBy ?? ""}`.toLowerCase().includes(q)}
          facets={[
            { columnId: "status", label: "Statuses", options: STATUS_OPTIONS },
            { columnId: "account", label: "Accounts", options: accountOptions },
          ]}
          initialSorting={[{ id: "period", desc: true }]}
          empty={
            <EmptyState
              icon={GitCompareArrows}
              title="No reconciliations yet"
              description="Start a reconciliation to match a bank or e-wallet statement against your ledger."
              action={
                <Button asChild size="sm">
                  <Link href="/reconciliation/new">
                    <Plus /> Start reconciliation
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
    </>
  );
}
