"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ChevronRight, Info, PartyPopper, type LucideIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";
import type { AlertSeverity, DashboardAlert } from "./use-dashboard-alerts";

export const SEVERITY_META: Record<AlertSeverity, { label: string; icon: LucideIcon; className: string }> = {
  critical: { label: "Critical", icon: AlertOctagon, className: "bg-error-light text-error-text" },
  warning: { label: "Warning", icon: AlertTriangle, className: "bg-warning-light text-warning-text" },
  info: { label: "Info", icon: Info, className: "bg-info-light text-info-text" },
};

const COLLAPSED = 6;

export function AlertsCard({ alerts, loading }: { alerts: DashboardAlert[]; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const counts = { critical: 0, warning: 0, info: 0 } as Record<AlertSeverity, number>;
  for (const a of alerts) counts[a.severity]++;
  const shown = expanded ? alerts : alerts.slice(0, COLLAPSED);

  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="border-b py-4 max-sm:grid-cols-1!">
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Live from invoices, bills, stock, imports, reconciliations and till counts.</CardDescription>
        {!loading && alerts.length > 0 && (
          <CardAction className="max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto max-sm:justify-self-start max-sm:justify-start flex flex-wrap justify-end gap-1.5">
            {(Object.keys(counts) as AlertSeverity[])
              .filter((s) => counts[s] > 0)
              .map((s) => {
                const M = SEVERITY_META[s];
                return (
                  <span key={s} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums", M.className)}>
                    <M.icon className="size-3" aria-hidden />
                    {counts[s]} {M.label.toLowerCase()}
                  </span>
                );
              })}
          </CardAction>
        )}
      </CardHeader>
      {loading ? (
        <ul className="divide-y" aria-busy="true" aria-label="Loading alerts">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : alerts.length === 0 ? (
        <EmptyState icon={PartyPopper} title="All clear" description="No overdue invoices, upcoming bills, stock or review issues in this scope." />
      ) : (
        <>
          <ul className="divide-y">
            {shown.map((a) => {
              const M = SEVERITY_META[a.severity];
              return (
                <li key={a.id}>
                  <Link href={a.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", M.className)}>
                      <M.icon className="size-4" aria-hidden />
                      <span className="sr-only">{M.label}:</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>
                    </span>
                    {a.amount && <Money amount={a.amount.value} currency={a.amount.currency} className="text-sm font-medium" />}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          {alerts.length > COLLAPSED && (
            <div className="mt-auto border-t px-3 py-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
                {expanded ? "Show fewer" : `Show ${alerts.length - COLLAPSED} more`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
