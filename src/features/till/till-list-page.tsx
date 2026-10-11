"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Calculator, Plus, ShieldCheck, Undo2, X } from "lucide-react";
import type { TillSession } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, today } from "@/lib/date";
import { SHIFT_LABEL, TILL_STATUS_OPTIONS, tillDiff } from "./till-utils";
import { VarianceBadge } from "./till-ui";

function CurrencyCell({ counted, expected, currency }: { counted: number; expected: number; currency: "USD" | "KHR" }) {
  return (
    <div className="flex flex-col items-end">
      <Money amount={counted} currency={currency} className="font-medium" />
      <span className="text-xs text-muted-foreground">
        of <Money amount={expected} currency={currency} /> expected
      </span>
    </div>
  );
}

export function TillListPage() {
  const router = useRouter();
  const sessions = useAppStore((s) => s.tillSessions);
  const { inScope, isOwner, branches } = useScope();
  const { branchName } = useLookups();
  const canSignOff = useCan("till.signoff");
  const loading = useInitialLoad();
  const [date, setDate] = useState("");

  const scoped = useMemo(() => sessions.filter((s) => inScope(s.branchId)), [sessions, inScope]);
  const data = useMemo(() => (date ? scoped.filter((s) => s.date === date) : scoped), [scoped, date]);
  const awaiting = useMemo(() => scoped.filter((s) => s.status === "submitted").sort((a, b) => b.date.localeCompare(a.date)), [scoped]);
  const returned = useMemo(() => scoped.filter((s) => s.status === "returned").sort((a, b) => b.date.localeCompare(a.date)), [scoped]);

  const columns = useMemo<ColumnDef<TillSession, unknown>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        meta: { label: "Date" },
        cell: ({ row }) => (
          <Link href={`/till-balancing/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="font-medium whitespace-nowrap text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {formatDate(row.original.date)}
          </Link>
        ),
      },
      {
        id: "branch",
        accessorFn: (s) => s.branchId,
        header: ({ column }) => <SortHeader column={column} title="Branch" />,
        meta: { label: "Branch" },
        sortingFn: (a, b) => branchName(a.original.branchId).localeCompare(branchName(b.original.branchId)),
        cell: ({ row }) => <span className="whitespace-nowrap">{branchName(row.original.branchId)}</span>,
      },
      { accessorKey: "shift", header: "Shift", meta: { label: "Shift" }, cell: ({ row }) => SHIFT_LABEL[row.original.shift] },
      {
        id: "usd",
        accessorFn: (s) => s.countedUSD,
        header: ({ column }) => <SortHeader column={column} title="USD counted" align="right" />,
        meta: { align: "right", label: "USD counted" },
        cell: ({ row }) => <CurrencyCell counted={row.original.countedUSD} expected={row.original.expectedUSD} currency="USD" />,
      },
      {
        id: "usdDiff",
        accessorFn: (s) => tillDiff(s, "USD"),
        header: ({ column }) => <SortHeader column={column} title="USD result" />,
        meta: { label: "USD result" },
        cell: ({ row }) => <VarianceBadge diff={tillDiff(row.original, "USD")} currency="USD" />,
      },
      {
        id: "khr",
        accessorFn: (s) => s.countedKHR,
        header: ({ column }) => <SortHeader column={column} title="KHR counted" align="right" />,
        meta: { align: "right", label: "KHR counted" },
        cell: ({ row }) => <CurrencyCell counted={row.original.countedKHR} expected={row.original.expectedKHR} currency="KHR" />,
      },
      {
        id: "khrDiff",
        accessorFn: (s) => tillDiff(s, "KHR"),
        header: ({ column }) => <SortHeader column={column} title="KHR result" />,
        meta: { label: "KHR result" },
        cell: ({ row }) => <VarianceBadge diff={tillDiff(row.original, "KHR")} currency="KHR" />,
      },
      { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "submittedBy", header: "Counted by", meta: { label: "Counted by" }, cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{row.original.submittedBy}</span> },
    ],
    [branchName],
  );

  const facets = [
    { columnId: "status", label: "Statuses", options: TILL_STATUS_OPTIONS },
    ...(isOwner && branches.length > 1 ? [{ columnId: "branch", label: "Branches", options: branches.map((b) => ({ value: b.id, label: b.name })) }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Till balancing"
        description="End-of-shift cash counts per branch. USD and KHR drawers are counted and balanced separately — they are never added together."
        actions={
          <Button asChild>
            <Link href="/till-balancing/new">
              <Plus /> Count till
            </Link>
          </Button>
        }
      />

      {!loading && canSignOff && awaiting.length > 0 && (
        <section aria-labelledby="till-awaiting" className="mb-4 rounded-xl border border-info/30 bg-info-light p-4">
          <h2 id="till-awaiting" className="flex items-center gap-2 text-sm font-semibold text-info-text">
            <ShieldCheck className="size-4" aria-hidden />
            {awaiting.length} till {awaiting.length === 1 ? "count" : "counts"} awaiting your sign-off
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((s) => (
              <li key={s.id}>
                <Link href={`/till-balancing/${s.id}`} className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {branchName(s.branchId)} · {formatDate(s.date, "dd MMM")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <VarianceBadge diff={tillDiff(s, "USD")} currency="USD" />
                      <VarianceBadge diff={tillDiff(s, "KHR")} currency="KHR" />
                    </div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && returned.length > 0 && (
        <section aria-labelledby="till-returned" className="mb-4 rounded-xl border border-warning/30 bg-warning-light p-4">
          <h2 id="till-returned" className="flex items-center gap-2 text-sm font-semibold text-warning-text">
            <Undo2 className="size-4" aria-hidden />
            {returned.length} till {returned.length === 1 ? "count was" : "counts were"} returned for correction
          </h2>
          <p className="mt-1 text-xs text-warning-text">{isOwner ? "Waiting for the branch to recount and resubmit." : "Recount the drawer and resubmit for sign-off."}</p>
          <ul className="mt-3 space-y-2">
            {returned.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/till-balancing/${s.id}`} className="font-medium hover:underline">
                    {branchName(s.branchId)} · {formatDate(s.date)}
                  </Link>
                  {s.reviewNote && <p className="text-xs text-muted-foreground">“{s.reviewNote}” — {s.reviewedBy}</p>}
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={`/till-balancing/new?session=${s.id}`}>
                    <Calculator /> Recount & resubmit
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          searchPlaceholder="Search counts…"
          searchFn={(s, q) => `${branchName(s.branchId)} ${s.submittedBy} ${s.date} ${formatDate(s.date)} ${s.notes ?? ""}`.toLowerCase().includes(q)}
          facets={facets}
          toolbar={
            <div className="flex items-center gap-1">
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="Filter by count date" />
              {date && (
                <Button variant="ghost" size="icon-sm" onClick={() => setDate("")} aria-label="Clear date filter">
                  <X />
                </Button>
              )}
            </div>
          }
          getRowId={(s) => s.id}
          onRowClick={(s) => router.push(`/till-balancing/${s.id}`)}
          initialSorting={[{ id: "date", desc: true }]}
          empty={
            date ? (
              <EmptyState compact icon={Calculator} title={`No till counts on ${formatDate(date)}`} description="Pick another date or clear the date filter." action={<Button variant="outline" size="sm" onClick={() => setDate("")}>Clear date</Button>} />
            ) : (
              <EmptyState
                icon={Calculator}
                title="No till counts yet"
                description="Count the cash drawer at the end of each shift to compare it with recorded cash sales."
                action={
                  <Button asChild>
                    <Link href="/till-balancing/new">
                      <Plus /> Count till
                    </Link>
                  </Button>
                }
              />
            )
          }
        />
      </Card>
    </>
  );
}
