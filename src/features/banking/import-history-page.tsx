"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertOctagon, ExternalLink, FileClock, HelpCircle, RefreshCw, Upload } from "lucide-react";
import type { ImportBatch, ImportKind } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatDateTime } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailList } from "@/components/shared/detail-list";
import { EmptyState } from "@/components/shared/states";
import { Money } from "@/components/shared/money";
import { DataTable, SortHeader } from "@/components/tables/data-table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBytes } from "@/features/import/lib/csv";
import { BankingNav } from "./banking-nav";

export const KIND_LABEL: Record<ImportKind, string> = {
  bank_statement: "Bank statement",
  receipt: "Receipt",
  supplier_bill: "Supplier bill",
  payment_screenshot: "Payment screenshot",
  item_catalog: "Item catalog",
  spreadsheet: "Spreadsheet",
};

export function retryHref(b: ImportBatch): string {
  return b.kind === "bank_statement" ? `/banking/import?retry=${b.id}${b.accountId ? `&account=${b.accountId}` : ""}` : `/import?type=${b.kind}`;
}

export function ImportHistoryPage({ accountId, embedded }: { accountId?: string; embedded?: boolean }) {
  const imports = useAppStore((s) => s.imports);
  const { inScope } = useScope();
  const { accountName, branchName } = useLookups();
  const loading = useInitialLoad();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selectedId = params.get("batch");

  const data = useMemo(() => imports.filter((b) => inScope(b.branchId) && (!accountId || b.accountId === accountId)), [imports, inScope, accountId]);
  const selected = data.find((b) => b.id === selectedId);

  const open = (b?: ImportBatch) => {
    const q = new URLSearchParams(params.toString());
    if (b) q.set("batch", b.id);
    else q.delete("batch");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };

  const columns = useMemo<ColumnDef<ImportBatch, unknown>[]>(
    () => [
      {
        accessorKey: "fileName",
        header: ({ column }) => <SortHeader column={column} title="File" />,
        meta: { label: "File" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-64 truncate font-medium">{row.original.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(row.original.fileSize)}</p>
          </div>
        ),
      },
      { id: "kind", accessorFn: (b) => b.kind, header: "Type", meta: { label: "Type" }, cell: ({ row }) => <Badge variant="outline">{KIND_LABEL[row.original.kind]}</Badge> },
      { id: "bank", accessorFn: (b) => b.bank ?? "—", header: "Bank", meta: { label: "Bank" } },
      { id: "account", accessorFn: (b) => (b.accountId ? accountName(b.accountId) : "—"), header: "Account", meta: { label: "Account" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { id: "branch", accessorFn: (b) => branchName(b.branchId), header: "Branch", meta: { label: "Branch" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { id: "status", accessorFn: (b) => b.status, header: "Status", meta: { label: "Status" }, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
      { accessorKey: "importedRows", header: ({ column }) => <SortHeader column={column} title="Imported" align="right" />, meta: { align: "right", label: "Imported" } },
      { accessorKey: "duplicateRows", header: "Duplicates", meta: { align: "right", label: "Duplicates" } },
      { accessorKey: "errorRows", header: "Errors", meta: { align: "right", label: "Errors" }, cell: ({ getValue }) => <span className={(getValue() as number) > 0 ? "text-error-text" : undefined}>{getValue() as number}</span> },
      { accessorKey: "reviewRows", header: "Review", meta: { align: "right", label: "Review" }, cell: ({ getValue }) => <span className={(getValue() as number) > 0 ? "font-medium text-warning-text" : undefined}>{getValue() as number}</span> },
      { accessorKey: "createdBy", header: "Created by", meta: { label: "Created by" }, cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { accessorKey: "createdAt", header: ({ column }) => <SortHeader column={column} title="Created" />, meta: { label: "Created" }, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue() as string)}</span> },
    ],
    [accountName, branchName],
  );

  const facets = [
    { columnId: "status", label: "Statuses", options: ["processing", "completed", "needs_review", "failed"].map((s) => ({ value: s, label: s === "needs_review" ? "Needs review" : s[0].toUpperCase() + s.slice(1) })) },
    { columnId: "kind", label: "Types", options: (Object.keys(KIND_LABEL) as ImportKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] })) },
    ...(accountId ? [] : [{ columnId: "bank", label: "Banks", options: ["ABA", "Wing", "ACLEDA"].map((b) => ({ value: b, label: b })) }]),
  ];

  const table = (
    <Card className="gap-0 py-0">
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        facets={facets}
        searchPlaceholder="Search imports…"
        getRowId={(b) => b.id}
        onRowClick={open}
        initialSorting={[{ id: "createdAt", desc: true }]}
        initialHidden={embedded ? ["bank", "account", "branch", "createdBy"] : ["branch"]}
        pageSize={embedded ? 5 : 10}
        empty={
          <EmptyState
            icon={FileClock}
            title="No imports yet"
            description="Imported statements and documents will be listed here with their results."
            action={
              <Button size="sm" asChild>
                <Link href={accountId ? `/banking/import?account=${accountId}` : "/banking/import"}>
                  <Upload /> Import a statement
                </Link>
              </Button>
            }
          />
        }
      />
    </Card>
  );

  return (
    <>
      {!embedded && (
        <>
          <PageHeader
            title="Import history"
            description="Every statement and document import, with row counts and outcomes. Select an import for details."
            actions={
              <>
                <Button variant="outline" asChild>
                  <Link href="/import">Import a document</Link>
                </Button>
                <Button asChild>
                  <Link href="/banking/import">
                    <Upload /> Import statement
                  </Link>
                </Button>
              </>
            }
          />
          <BankingNav />
        </>
      )}
      {table}
      <BatchSheet batch={selected} onClose={() => open(undefined)} />
    </>
  );
}

function BatchSheet({ batch, onClose }: { batch?: ImportBatch; onClose: () => void }) {
  const transactions = useAppStore((s) => s.transactions);
  const bills = useAppStore((s) => s.bills);
  const items = useAppStore((s) => s.items);
  const { accountName, branchName } = useLookups();

  const records = useMemo(() => {
    if (!batch) return [];
    return batch.createdRecordIds.slice(0, 50).map((id) => {
      const t = transactions.find((x) => x.id === id);
      if (t) return { id, href: `/transactions/${id}`, label: t.description, sub: t.status === "needs_review" ? "Needs review" : "Posted", money: { amount: t.type === "expense" ? -t.amount : t.amount, currency: t.currency } };
      const b = bills.find((x) => x.id === id);
      if (b) return { id, href: `/bills/${id}`, label: `${b.number} – ${b.supplier}`, sub: "Bill", money: { amount: -b.amount, currency: b.currency } };
      const i = items.find((x) => x.id === id);
      if (i) return { id, href: `/items/${id}`, label: `${i.sku} – ${i.name}`, sub: "Item" };
      return { id, href: undefined, label: id, sub: "Record" };
    });
  }, [batch, transactions, bills, items]);

  return (
    <Sheet open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {batch && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 break-all">{batch.fileName}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <StatusBadge status={batch.status} /> {KIND_LABEL[batch.kind]} · {formatBytes(batch.fileSize)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              {batch.status === "failed" && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-light/40 p-3 text-sm text-error-text">
                  <AlertOctagon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="space-y-2">
                    <p>{batch.errorMessage ?? "The import failed."}</p>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={retryHref(batch)}>
                        <RefreshCw /> Retry import
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
              {batch.status === "needs_review" && (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning-light/40 p-3 text-sm text-warning-text">
                  <p className="flex items-start gap-2">
                    <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {batch.reviewRows} transaction{batch.reviewRows === 1 ? "" : "s"} still need a category.
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/banking/uncategorized">Review</Link>
                  </Button>
                </div>
              )}
              <DetailList
                items={[
                  { label: "Account", value: batch.accountId ? <Link className="text-primary hover:underline" href={`/accounts/${batch.accountId}`}>{accountName(batch.accountId)}</Link> : "—" },
                  { label: "Bank", value: batch.bank ?? "—" },
                  { label: "Branch", value: branchName(batch.branchId) },
                  { label: "Created by", value: batch.createdBy },
                  { label: "Started", value: formatDateTime(batch.createdAt) },
                  { label: "Completed", value: formatDateTime(batch.completedAt) },
                ]}
              />
              <dl className="grid grid-cols-5 gap-2 text-center">
                {(
                  [
                    ["Rows", batch.totalRows],
                    ["Imported", batch.importedRows],
                    ["Duplicates", batch.duplicateRows],
                    ["Errors", batch.errorRows],
                    ["Review", batch.reviewRows],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="rounded-lg border p-2">
                    <dt className="text-[11px] text-muted-foreground">{l}</dt>
                    <dd className="text-base font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Created records</h3>
                {records.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{batch.status === "failed" ? "No records were created." : batch.importedRows > 0 ? "Record links aren't available for this historical import." : "No records were created — every row was skipped."}</p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {records.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          {r.href ? (
                            <Link href={r.href} className="flex items-center gap-1 truncate font-medium text-primary hover:underline">
                              <span className="truncate">{r.label}</span> <ExternalLink className="size-3 shrink-0" aria-hidden />
                            </Link>
                          ) : (
                            <span className="truncate">{r.label}</span>
                          )}
                          <p className="text-xs text-muted-foreground">{r.sub}</p>
                        </div>
                        {r.money && <Money amount={r.money.amount} currency={r.money.currency} tone />}
                      </li>
                    ))}
                  </ul>
                )}
                {batch.createdRecordIds.length > 50 && <p className="mt-2 text-xs text-muted-foreground">Showing 50 of {batch.createdRecordIds.length} records.</p>}
                {batch.accountId && batch.importedRows > 0 && (
                  <Button size="sm" variant="outline" className="mt-3" asChild>
                    <Link href={`/accounts/${batch.accountId}`}>View account transactions</Link>
                  </Button>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
