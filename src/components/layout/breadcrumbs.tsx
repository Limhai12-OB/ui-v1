"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { SEGMENT_LABELS } from "@/lib/navigation";
import { useAppStore, type AppState } from "@/store/app-store";
import { formatDate, formatMonth } from "@/lib/date";

/** Resolve a dynamic id segment to a readable name from the demo store. */
function resolveSegment(s: AppState, parent: string | undefined, seg: string): string | undefined {
  switch (parent) {
    case "invoices":
      return s.invoices.find((x) => x.id === seg)?.number;
    case "customers":
      return s.customers.find((x) => x.id === seg)?.name;
    case "items":
      return s.items.find((x) => x.id === seg)?.name;
    case "bills":
      return s.bills.find((x) => x.id === seg)?.number;
    case "branches":
      return s.branches.find((x) => x.id === seg)?.name;
    case "accounts":
      return s.accounts.find((x) => x.id === seg)?.name;
    case "planned-purchases":
      return s.plannedPurchases.find((x) => x.id === seg)?.number;
    case "transactions":
      return s.transactions.find((x) => x.id === seg)?.reference ?? (s.transactions.some((x) => x.id === seg) ? "Transaction" : undefined);
    case "reports": {
      const r = s.reports.find((x) => x.id === seg);
      return r ? formatMonth(r.month) : undefined;
    }
    case "reconciliation": {
      const r = s.reconciliations.find((x) => x.id === seg);
      if (!r) return undefined;
      return `${s.accounts.find((a) => a.id === r.accountId)?.name ?? "Account"} · ${formatDate(r.periodStart, "MMM yyyy")}`;
    }
    case "till-balancing": {
      const t = s.tillSessions.find((x) => x.id === seg);
      return t ? `Count · ${formatDate(t.date)}` : undefined;
    }
    case "integrations":
      return s.integrations.find((x) => x.id === seg)?.name;
    case "walk-in-sales":
    case "item-sales":
      return s.sales.find((x) => x.id === seg)?.number;
    case "stock-adjustments":
      return s.stockAdjustments.find((x) => x.id === seg)?.number;
    default:
      return undefined;
  }
}

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const state = useAppStore();
  const segs = pathname.split("/").filter(Boolean);
  const crumbs = segs.map((seg, i) => {
    const href = "/" + segs.slice(0, i + 1).join("/");
    const label = SEGMENT_LABELS[seg] ?? resolveSegment(state, segs[i - 1], seg) ?? decodeURIComponent(seg);
    return { href, label };
  });
  if (crumbs.length === 0) return null;
  const current = crumbs[crumbs.length - 1];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href}>
              {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden />}
              <li className={last ? "min-w-0" : "hidden min-w-0 sm:block"}>
                {last ? (
                  <span aria-current="page" className="block truncate font-semibold text-foreground">
                    {current.label}
                  </span>
                ) : (
                  <Link href={c.href} className="block max-w-40 truncate rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {c.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
