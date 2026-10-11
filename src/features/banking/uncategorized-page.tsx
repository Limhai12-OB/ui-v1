"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, CheckCheck, Loader2, PartyPopper, Upload } from "lucide-react";
import type { ID, Transaction } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { transactionService } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { AIBadge, DemoNotice } from "@/components/shared/demo-notice";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CategorySelect } from "@/components/forms/entity-selects";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BankingNav } from "./banking-nav";
import { LOW_CONFIDENCE } from "./categorize";
import { Confidence } from "./statement-import/review-steps";

export function UncategorizedPage() {
  const transactions = useAppStore((s) => s.transactions);
  const { inScope } = useScope();
  const { accountName, categoryName, branchName } = useLookups();
  const loading = useInitialLoad();
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const [busy, setBusy] = useState<Set<ID>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState<"selected" | "high" | null>(null);

  const data = useMemo(() => transactions.filter((t) => t.status === "needs_review" && inScope(t.branchId)).sort((a, b) => b.date.localeCompare(a.date)), [transactions, inScope]);
  const high = data.filter((t) => t.suggestedCategoryId && (t.suggestionConfidence ?? 0) >= LOW_CONFIDENCE);
  const selectedRows = data.filter((t) => selected.has(t.id));
  const selectedWithSuggestion = selectedRows.filter((t) => t.suggestedCategoryId);

  const categorizeFn = useCallback(async (ids: ID[], categoryId?: ID) => {
    setBusy((b) => new Set([...b, ...ids]));
    try {
      await transactionService.categorize(ids, categoryId);
      return ids.length;
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        ids.forEach((i) => n.delete(i));
        return n;
      });
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((i) => n.delete(i));
        return n;
      });
    }
  }, []);
  const categorize = useAction(categorizeFn, { success: (n: number) => `${n} transaction${n === 1 ? "" : "s"} categorized and posted` });

  const toggle = (id: ID, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const columns = useMemo<ColumnDef<Transaction, unknown>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        header: () => (
          <Checkbox
            aria-label="Select all"
            checked={data.length > 0 && selected.size === data.length ? true : selected.size > 0 ? "indeterminate" : false}
            onCheckedChange={(v) => setSelected(v === true ? new Set(data.map((t) => t.id)) : new Set())}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.description}`} checked={selected.has(row.original.id)} onCheckedChange={(v) => toggle(row.original.id, v === true)} onClick={(e) => e.stopPropagation()} />,
      },
      { accessorKey: "date", header: ({ column }) => <SortHeader column={column} title="Date" />, meta: { label: "Date" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue() as string)}</span> },
      {
        accessorKey: "description",
        header: "Description",
        meta: { label: "Description" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/transactions/${row.original.id}`} className="block max-w-72 truncate font-medium hover:underline">
              {row.original.description}
            </Link>
            <p className="text-xs text-muted-foreground">
              {accountName(row.original.accountId)} · {branchName(row.original.branchId)}
            </p>
          </div>
        ),
      },
      {
        id: "amount",
        accessorFn: (t) => (t.type === "expense" ? -t.amount : t.amount),
        header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />,
        meta: { align: "right", label: "Amount" },
        cell: ({ row }) => <Money amount={row.original.type === "expense" ? -row.original.amount : row.original.amount} currency={row.original.currency} tone />,
      },
      {
        id: "suggestion",
        accessorFn: (t) => (t.suggestedCategoryId ? categoryName(t.suggestedCategoryId) : ""),
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            Suggestion <AIBadge label="AI" />
          </span>
        ),
        meta: { label: "Suggestion" },
        cell: ({ row }) =>
          row.original.suggestedCategoryId ? (
            <div className="space-y-1">
              <span className="inline-flex rounded-md bg-ai-light px-1.5 py-0.5 text-xs font-medium text-ai-text">{categoryName(row.original.suggestedCategoryId)}</span>
              {row.original.suggestionConfidence !== undefined && (
                <div>
                  <Confidence value={row.original.suggestionConfidence} />
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No suggestion</span>
          ),
      },
      {
        id: "category",
        header: "Set category",
        meta: { label: "Set category" },
        cell: ({ row }) => (
          <div className="w-48" onClick={(e) => e.stopPropagation()}>
            <CategorySelect
              id={`cat-${row.original.id}`}
              kind={row.original.type === "income" ? "income" : "expense"}
              value={undefined}
              onChange={(v) => categorize.fire([row.original.id], v)}
              placeholder="Choose category…"
              disabled={busy.has(row.original.id)}
              className="h-8 w-full"
            />
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Accept</span>,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.suggestedCategoryId ? (
            <Button size="xs" variant="outline" disabled={busy.has(row.original.id)} onClick={() => categorize.fire([row.original.id])} aria-label={`Accept suggestion for ${row.original.description}`}>
              {busy.has(row.original.id) ? <Loader2 className="animate-spin" /> : <Check />} Accept
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, selected, busy, accountName, categoryName, branchName],
  );

  return (
    <>
      <PageHeader
        title="Uncategorized transactions"
        description="Imported transactions waiting for a category. They're excluded from reports and the dashboard until confirmed."
        actions={
          high.length > 0 && (
            <Button onClick={() => setConfirmBulk("high")}>
              <CheckCheck /> Accept {high.length} high-confidence
            </Button>
          )
        }
      />
      <BankingNav />

      {selected.size > 0 && (
        <div role="status" aria-live="polite" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-light/40 px-4 py-2.5">
          <p className="text-sm font-medium tabular-nums">
            {selected.size} selected{selectedWithSuggestion.length < selected.size && ` · ${selected.size - selectedWithSuggestion.length} without a suggestion`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button size="sm" disabled={selectedWithSuggestion.length === 0 || categorize.pending} onClick={() => setConfirmBulk("selected")}>
              <Check /> Accept {selectedWithSuggestion.length} suggestion{selectedWithSuggestion.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          getRowId={(t) => t.id}
          searchPlaceholder="Search descriptions…"
          searchFn={(t, q) => t.description.toLowerCase().includes(q) || (t.counterparty ?? "").toLowerCase().includes(q)}
          initialSorting={[{ id: "date", desc: true }]}
          pageSize={20}
          empty={
            <EmptyState
              icon={PartyPopper}
              title="All caught up"
              description="Every imported transaction has a confirmed category."
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link href="/banking/import">
                    <Upload /> Import a statement
                  </Link>
                </Button>
              }
            />
          }
        />
      </Card>
      <DemoNotice variant="ai" className="mt-4">
        Suggestions and confidence scores come from simulated keyword rules. Accepting posts the transaction with the suggested category; choosing a category posts it with your choice.
      </DemoNotice>

      <ConfirmDialog
        open={confirmBulk !== null}
        onOpenChange={(o) => !o && setConfirmBulk(null)}
        title={confirmBulk === "high" ? `Accept ${high.length} high-confidence suggestions?` : `Accept ${selectedWithSuggestion.length} suggestions?`}
        description={
          confirmBulk === "high"
            ? `Transactions with confidence of ${Math.round(LOW_CONFIDENCE * 100)}% or more will be posted with the AI-suggested category. Low-confidence rows stay in review.`
            : "The selected transactions will be posted with their AI-suggested categories. Rows without a suggestion stay in review."
        }
        confirmLabel="Accept and post"
        onConfirm={() => categorize.run((confirmBulk === "high" ? high : selectedWithSuggestion).map((t) => t.id))}
      />
    </>
  );
}
