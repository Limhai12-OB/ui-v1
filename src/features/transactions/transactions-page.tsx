"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarRange, ChevronDown, Plus, ShieldCheck } from "lucide-react";
import type { Currency, Transaction } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatDate } from "@/lib/date";
import { roundMoney } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, SortHeader, type FacetFilter } from "@/components/tables/data-table";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Money } from "@/components/shared/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, SOURCE_LABEL, TYPE_LABEL, presetRange, type DatePreset } from "./meta";
import { TxAmount } from "./tx-amount";

const CURRENCIES: Currency[] = ["USD", "KHR"];

export function NewTransactionMenu({ align = "end" }: { align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> New <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/transactions/new?type=income">
            <ArrowDownLeft className="text-success-text" /> Add income
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/transactions/new?type=expense">
            <ArrowUpRight className="text-error-text" /> Add expense
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/transactions/new?type=transfer">
            <ArrowLeftRight /> Add transfer
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TransactionsPage() {
  const router = useRouter();
  const transactions = useAppStore((s) => s.transactions);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const { inScope, branches } = useScope();
  const lk = useLookups();
  const loading = useInitialLoad();
  const [preset, setPreset] = useState<DatePreset>("last_90");
  const [visible, setVisible] = useState<Transaction[] | null>(null);
  const onFiltered = useCallback((rows: Transaction[]) => setVisible(rows), []);

  const inScopeTxs = useMemo(() => transactions.filter((t) => inScope(t.branchId)), [transactions, inScope]);

  const data = useMemo(() => {
    const range = presetRange(preset);
    if (!range) return inScopeTxs;
    return inScopeTxs.filter((t) => t.date >= range.start && t.date <= range.end);
  }, [inScopeTxs, preset]);

  const facets = useMemo<FacetFilter[]>(() => {
    const usedCats = new Set(inScopeTxs.map((t) => t.categoryId).filter(Boolean));
    return [
      { columnId: "type", label: "Types", options: (["income", "expense", "transfer"] as const).map((v) => ({ value: v, label: TYPE_LABEL[v] })) },
      {
        columnId: "status",
        label: "Statuses",
        options: [
          { value: "posted", label: "Posted" },
          { value: "needs_review", label: "Needs review" },
        ],
      },
      { columnId: "source", label: "Sources", options: Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label })) },
      {
        columnId: "category",
        label: "Categories",
        options: [
          ...categories.filter((c) => c.kind !== "item" && usedCats.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
          { value: "__none", label: "Uncategorized" },
        ],
      },
      {
        columnId: "account",
        label: "Accounts",
        options: accounts.filter((a) => inScope(a.branchId)).map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` })),
      },
    ];
  }, [inScopeTxs, categories, accounts, inScope]);

  const columns = useMemo<ColumnDef<Transaction, unknown>[]>(
    () => [
      {
        id: "date",
        accessorFn: (t) => `${t.date}|${t.createdAt}`,
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        meta: { label: "Date" },
        enableHiding: false,
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.original.date)}</span>,
      },
      {
        id: "description",
        accessorFn: (t) => t.description,
        header: ({ column }) => <SortHeader column={column} title="Description" />,
        meta: { label: "Description" },
        enableHiding: false,
        cell: ({ row }) => (
          <div className="max-w-[320px] min-w-[180px]">
            <Link href={`/transactions/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none">
              {row.original.description}
            </Link>
            {row.original.counterparty && <p className="truncate text-xs text-muted-foreground">{row.original.counterparty}</p>}
          </div>
        ),
      },
      {
        id: "category",
        accessorFn: (t) => t.categoryId ?? (t.type === "transfer" ? "__transfer" : "__none"),
        header: "Category",
        meta: { label: "Category" },
        cell: ({ row }) => {
          const t = row.original;
          if (t.type === "transfer") return <span className="text-muted-foreground">—</span>;
          if (!t.categoryId) return <span className="text-warning-text">Uncategorized</span>;
          return <span className="whitespace-nowrap">{lk.categoryName(t.categoryId)}</span>;
        },
      },
      {
        id: "account",
        accessorFn: (t) => t.accountId,
        header: "Account",
        meta: { label: "Account" },
        cell: ({ row }) => {
          const t = row.original;
          return (
            <span className="whitespace-nowrap text-sm">
              {lk.accountName(t.accountId)}
              {t.type === "transfer" && t.toAccountId && <span className="text-muted-foreground"> → {lk.accountName(t.toAccountId)}</span>}
            </span>
          );
        },
      },
      {
        id: "branch",
        accessorFn: (t) => t.branchId,
        header: "Branch",
        meta: { label: "Branch" },
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{lk.branchName(row.original.branchId)}</span>,
      },
      {
        id: "source",
        accessorFn: (t) => t.source,
        header: "Source",
        meta: { label: "Source" },
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{SOURCE_LABEL[row.original.source]}</span>,
      },
      {
        id: "status",
        accessorFn: (t) => t.status,
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} />
            {row.original.reconciled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex text-success-text" tabIndex={0} aria-label="Reconciled">
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Reconciled against a bank statement</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      { id: "type", accessorFn: (t) => t.type, header: "Type", enableHiding: false, cell: ({ row }) => TYPE_LABEL[row.original.type] },
      {
        id: "amount",
        accessorFn: (t) => (t.type === "expense" ? -t.amount : t.amount),
        header: ({ column }) => <SortHeader column={column} title="Amount" align="right" />,
        meta: { align: "right", label: "Amount" },
        enableHiding: false,
        cell: ({ row }) => <TxAmount tx={row.original} />,
      },
    ],
    [lk],
  );

  const summary = useMemo(() => {
    const rows = visible ?? data;
    const s = { count: rows.length, review: 0, income: { USD: 0, KHR: 0 }, expense: { USD: 0, KHR: 0 }, has: { USD: false, KHR: false } };
    for (const t of rows) {
      if (t.status === "needs_review") s.review++;
      if (t.type === "income") s.income[t.currency] += t.amount;
      else if (t.type === "expense") s.expense[t.currency] += t.amount;
      if (t.type !== "transfer") s.has[t.currency] = true;
    }
    for (const c of CURRENCIES) {
      s.income[c] = roundMoney(s.income[c], c);
      s.expense[c] = roundMoney(s.expense[c], c);
    }
    return s;
  }, [visible, data]);

  const shownCurrencies = CURRENCIES.filter((c) => summary.has[c]);

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every income, expense and transfer across your accounts. Amounts stay in their own currency."
        actions={<NewTransactionMenu />}
      />

      <Card className="mb-4 gap-0 py-0" aria-live="polite">
        {loading ? (
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-36" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid divide-y sm:grid-cols-[minmax(0,0.8fr)_1fr_1fr_1fr] sm:divide-x sm:divide-y-0">
            <SummaryCell label="Transactions shown">
              <span className="text-lg font-semibold tabular-nums">{summary.count.toLocaleString("en-US")}</span>
              {summary.review > 0 && <p className="text-xs text-warning-text tabular-nums">{summary.review} need review</p>}
            </SummaryCell>
            <SummaryCell label="Income" icon={<ArrowDownLeft className="size-3.5 text-success-text" aria-hidden />}>
              <PerCurrency currencies={shownCurrencies} values={summary.income} className="text-success-text" />
            </SummaryCell>
            <SummaryCell label="Expenses" icon={<ArrowUpRight className="size-3.5 text-error-text" aria-hidden />}>
              <PerCurrency currencies={shownCurrencies} values={summary.expense} />
            </SummaryCell>
            <SummaryCell label="Net (income − expenses)">
              <PerCurrency
                currencies={shownCurrencies}
                values={{ USD: roundMoney(summary.income.USD - summary.expense.USD, "USD"), KHR: summary.income.KHR - summary.expense.KHR }}
                tone
              />
            </SummaryCell>
          </div>
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Totals reflect the current filters. USD and KHR are totalled separately and never combined; transfers between accounts are excluded.
        </p>
      </Card>

      <Card className="gap-0 py-0">
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          facets={facets}
          searchPlaceholder="Search description, counterparty, reference…"
          searchFn={(t, q) =>
            t.description.toLowerCase().includes(q) ||
            (t.counterparty?.toLowerCase().includes(q) ?? false) ||
            (t.reference?.toLowerCase().includes(q) ?? false) ||
            String(t.amount).includes(q)
          }
          toolbar={
            <Select value={preset} onValueChange={(v) => setPreset(v as DatePreset)}>
              <SelectTrigger className={cn("min-w-36", preset !== "all" && "border-primary/50 bg-primary-light/40")} aria-label="Date range">
                <CalendarRange className="text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          getRowId={(t) => t.id}
          onRowClick={(t) => router.push(`/transactions/${t.id}`)}
          onFilteredRowsChange={onFiltered}
          initialSorting={[{ id: "date", desc: true }]}
          initialHidden={["type", ...(branches.length <= 1 ? ["branch"] : [])]}
          pageSize={20}
          empty={
            <EmptyState
              icon={ArrowLeftRight}
              title={preset === "all" ? "No transactions yet" : "No transactions in this date range"}
              description={preset === "all" ? "Record income, expenses or transfers, or import a bank statement." : "Choose a wider date range or record a new transaction."}
              action={
                preset === "all" ? (
                  <Button asChild size="sm">
                    <Link href="/transactions/new?type=expense">Add expense</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setPreset("all")}>
                    Show all dates
                  </Button>
                )
              }
            />
          }
        />
      </Card>
    </>
  );
}

function SummaryCell({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1 px-4 py-3">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

function PerCurrency({ currencies, values, className, tone }: { currencies: Currency[]; values: Record<Currency, number>; className?: string; tone?: boolean }) {
  if (currencies.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5">
      {currencies.map((c) => (
        <div key={c} className="flex items-baseline gap-2">
          <Money amount={values[c]} currency={c} tone={tone} className={cn("text-base font-semibold", className)} />
          <span className="text-[11px] text-muted-foreground">{c}</span>
        </div>
      ))}
    </div>
  );
}
