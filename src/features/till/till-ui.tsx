"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import type { Currency, FinancialAccount, TillSession, Transaction } from "@/types";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/currency";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { denominationRows, varianceKind } from "./till-utils";

/** Over / Short / Balanced with icon. Red is reserved for a shortfall. */
export function VarianceBadge({ diff, currency, showAmount = true, className }: { diff: number; currency: Currency; showAmount?: boolean; className?: string }) {
  const kind = varianceKind(diff, currency);
  if (kind === "balanced")
    return (
      <Badge variant="success" className={cn("gap-1", className)}>
        <CheckCircle2 aria-hidden /> Balanced
      </Badge>
    );
  const Icon = kind === "over" ? ArrowUpRight : ArrowDownRight;
  return (
    <Badge variant={kind === "over" ? "warning" : "error"} className={cn("gap-1 tabular-nums", className)}>
      <Icon aria-hidden />
      {kind === "over" ? "Over" : "Short"}
      {showAmount && <span>{formatMoney(Math.abs(diff), currency)}</span>}
    </Badge>
  );
}

/** Signed difference text: red only when short. */
export function DiffText({ diff, currency, className }: { diff: number; currency: Currency; className?: string }) {
  const kind = varianceKind(diff, currency);
  return (
    <span className={cn("tabular-nums", kind === "short" && "text-error-text", kind === "over" && "text-warning-text", className)}>
      {formatMoney(diff, currency, { signed: true })}
    </span>
  );
}

interface BreakdownPanelProps {
  currency: Currency;
  float: number;
  transactions: Transaction[];
  drawers: FinancialAccount[];
  accountName: (id?: string) => string;
  /** Stored expected figure on a saved count, when it may differ from today's ledger. */
  storedExpected?: number;
}

function BreakdownPanel({ currency, float, transactions, drawers, accountName, storedExpected }: BreakdownPanelProps) {
  const total = transactions.reduce((s, t) => s + t.amount, 0) + float;
  const drift = storedExpected !== undefined && Math.abs(storedExpected - total) >= (currency === "USD" ? 0.005 : 0.5);
  return (
    <div className="min-w-0 rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <h4 className="text-sm font-medium">{currency} drawer</h4>
        <span className="truncate text-xs text-muted-foreground">{drawers.length ? drawers.map((d) => d.name).join(", ") : `No ${currency} cash drawer`}</span>
      </div>
      <ul className="divide-y text-sm">
        <li className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-muted-foreground">Opening float</span>
          <Money amount={float} currency={currency} />
        </li>
        {transactions.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <Link href={`/transactions/${t.id}`} className="block truncate font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {t.description}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">
                {accountName(t.accountId)}
                {t.reference ? ` · ${t.reference}` : ""}
              </span>
            </div>
            <Money amount={t.amount} currency={currency} signed className="text-success-text" />
          </li>
        ))}
        {transactions.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">{drawers.length ? "No cash income recorded in this drawer on this date." : "This branch has no cash drawer in this currency — expected equals the opening float."}</li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2 text-sm font-semibold">
        <span>Expected in drawer</span>
        <Money amount={storedExpected ?? total} currency={currency} />
      </div>
      {drift && (
        <p className="flex items-start gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          The ledger for this date now totals {formatMoney(total, currency)}. The expected figure above is what was recorded when the count was saved.
        </p>
      )}
    </div>
  );
}

export function ExpectedBreakdown(props: {
  floatUSD: number;
  floatKHR: number;
  usdTx: Transaction[];
  khrTx: Transaction[];
  usdDrawers: FinancialAccount[];
  khrDrawers: FinancialAccount[];
  accountName: (id?: string) => string;
  storedUSD?: number;
  storedKHR?: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BreakdownPanel currency="USD" float={props.floatUSD} transactions={props.usdTx} drawers={props.usdDrawers} accountName={props.accountName} storedExpected={props.storedUSD} />
      <BreakdownPanel currency="KHR" float={props.floatKHR} transactions={props.khrTx} drawers={props.khrDrawers} accountName={props.accountName} storedExpected={props.storedKHR} />
    </div>
  );
}

export function DenominationTable({ session, currency }: { session: TillSession; currency: Currency }) {
  const { rows, remainder, counted } = denominationRows(session, currency);
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm font-medium">{currency === "USD" ? "US dollars (USD)" : "Cambodian riel (KHR)"}</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-xs">Denomination</TableHead>
              <TableHead className="text-right text-xs">Count</TableHead>
              <TableHead className="pr-4 text-right text-xs">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="pl-4">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{r.coins ? "—" : r.count.toLocaleString("en-US")}</TableCell>
                <TableCell className="pr-4 text-right">
                  <Money amount={r.subtotal} currency={currency} />
                </TableCell>
              </TableRow>
            ))}
            {remainder !== 0 && (
              <TableRow>
                <TableCell className="pl-4">
                  Coins / loose change
                  <span className="block text-xs text-muted-foreground">Not itemised by denomination</span>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="pr-4 text-right">
                  <Money amount={remainder} currency={currency} />
                </TableCell>
              </TableRow>
            )}
            {rows.length === 0 && remainder === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="pl-4 text-sm text-muted-foreground">
                  No {currency} cash counted.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="pl-4 font-semibold" colSpan={2}>
                Counted {currency}
              </TableCell>
              <TableCell className="pr-4 text-right font-semibold">
                <Money amount={counted} currency={currency} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </Card>
  );
}

export function HistoryTimeline({ history }: { history: TillSession["history"] }) {
  const items = [...history].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative">
          <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden />
          <p className="text-sm font-medium">{h.action}</p>
          <p className="text-xs text-muted-foreground">
            {h.by} · {formatDateTime(h.at)}
          </p>
          {h.note && <p className="mt-1 rounded-md bg-muted px-2 py-1.5 text-xs">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

