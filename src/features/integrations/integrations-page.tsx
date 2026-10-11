"use client";

import Link from "next/link";
import { formatDistanceStrict, parseISO } from "date-fns";
import { ArrowRight, Check, Plug } from "lucide-react";
import type { Integration } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { formatDateTime, nowISO } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DemoNotice } from "@/components/shared/demo-notice";
import { EmptyState } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { INTEGRATION_META, connectionAccount } from "./integration-meta";

function primaryAction(i: Integration) {
  if (i.status === "error") return { label: "Reconnect", href: `/integrations/${i.id}?connect=1`, variant: "default" as const };
  if (i.status === "disconnected") return { label: "Connect", href: `/integrations/${i.id}?connect=1`, variant: "default" as const };
  return { label: "Manage", href: `/integrations/${i.id}`, variant: "outline" as const };
}

export function IntegrationsPage() {
  const loading = useInitialLoad();
  const integrations = useAppStore((s) => s.integrations);
  const connected = integrations.filter((i) => i.status === "connected" || i.status === "syncing").length;

  return (
    <>
      <PageHeader title="Integrations" description="Connect the tools your business already uses. Integrations apply to the whole business and are managed by the Business Owner." />
      <DemoNotice className="mb-6">Integrations are simulated in this demo. Connecting, syncing and disconnecting change demo state only — nothing is sent to Shopify, WeBill365 or Telegram.</DemoNotice>

      {!loading && integrations.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground" role="status">
          {connected} of {integrations.length} connected
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading integrations">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4 rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={Plug} title="No integrations available" description="Integrations will appear here when they are enabled for your business." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => {
            const M = INTEGRATION_META[i.id];
            const action = primaryAction(i);
            const account = connectionAccount(i);
            return (
              <Card key={i.id} className="gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex size-10 items-center justify-center rounded-lg", M.tint)}>
                      <M.icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <h2 className="text-base font-medium">
                        <Link href={`/integrations/${i.id}`} className="rounded hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          {i.name}
                        </Link>
                      </h2>
                      <p className="text-xs text-muted-foreground">{M.category}</p>
                    </div>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
                <p className="text-sm text-muted-foreground">{i.description}</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {M.capabilities.map((c) => (
                    <li key={c} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success-text" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
                {i.status === "error" && i.errorMessage && <p className="rounded-md bg-error-light px-2.5 py-1.5 text-xs text-error-text">{i.errorMessage}</p>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    {i.status === "disconnected" ? (
                      "Not connected"
                    ) : (
                      <>
                        {account && <p className="truncate font-medium text-foreground">{account}</p>}
                        <p title={i.lastSyncAt ? formatDateTime(i.lastSyncAt) : undefined}>
                          {i.lastSyncAt ? `Last sync ${formatDistanceStrict(parseISO(i.lastSyncAt), parseISO(nowISO()), { addSuffix: true })}` : "Never synced"}
                        </p>
                      </>
                    )}
                  </div>
                  <Button variant={action.variant} size="sm" asChild>
                    <Link href={action.href} aria-label={`${action.label} ${i.name}`}>
                      {action.label} <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
