"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { differenceInSeconds, parseISO } from "date-fns";
import { AlertOctagon, History, Loader2, Plug, PlugZap, RefreshCw, Unplug } from "lucide-react";
import type { Integration, IntegrationSyncRun } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { integrationService } from "@/lib/api";
import { formatDateTime, nowISO } from "@/lib/date";
import { uid } from "@/store/app-store";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DemoNotice } from "@/components/shared/demo-notice";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DetailList } from "@/components/shared/detail-list";
import { DataTable } from "@/components/tables/data-table";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INTEGRATION_META, SCHEDULE_LABEL, isIntegrationId, maskToken } from "./integration-meta";
import { ConnectDialog } from "./connect-dialog";
import { IntegrationConfigForm } from "./config-form";
import { runSimulatedSync } from "./simulated-sync";

function duration(run: IntegrationSyncRun) {
  if (!run.finishedAt) return "—";
  const s = differenceInSeconds(parseISO(run.finishedAt), parseISO(run.startedAt));
  if (s < 1) return "< 1 s";
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
}

const historyColumns: ColumnDef<IntegrationSyncRun, unknown>[] = [
  { accessorKey: "startedAt", header: "Started", cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue() as string)}</span> },
  { id: "duration", header: "Duration", meta: { align: "right" }, cell: ({ row }) => <span className="whitespace-nowrap">{duration(row.original)}</span> },
  { accessorKey: "status", header: "Status", cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
  { accessorKey: "recordsProcessed", header: "Records", meta: { align: "right" }, cell: ({ getValue }) => (getValue() as number).toLocaleString("en-US") },
  { accessorKey: "message", header: "Message", cell: ({ getValue }) => <span className="block min-w-[220px] text-muted-foreground">{getValue() as string}</span> },
];

export function IntegrationDetail({ id }: { id: string }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationDetailInner id={id} />
    </Suspense>
  );
}

function IntegrationDetailInner({ id }: { id: string }) {
  const integration = useAppStore((s) => s.integrations.find((i) => i.id === id));
  if (!isIntegrationId(id) || !integration)
    return (
      <EmptyState
        icon={Plug}
        title="Integration not found"
        description="This integration doesn't exist or isn't available for your business."
        action={
          <Button asChild>
            <Link href="/integrations">Back to integrations</Link>
          </Button>
        }
      />
    );
  return <Detail i={integration} />;
}

function Detail({ i }: { i: Integration }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { branchName } = useLookups();
  const M = INTEGRATION_META[i.id];
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  // Deep link from the list: /integrations/<id>?connect=1
  useEffect(() => {
    if (params.get("connect") === "1") {
      if (i.status === "disconnected" || i.status === "error") setConnectOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [params, pathname, router, i.status]);

  const sync = useAction(() => runSimulatedSync(i.id), { success: `${i.name} sync finished — no new records imported (simulated)` });
  const disconnect = useAction(
    async () => {
      await integrationService.update(i.id, { status: "disconnected", connectedAt: undefined, errorMessage: undefined });
      await integrationService.addRun(i.id, { id: uid("sync"), startedAt: nowISO(), finishedAt: nowISO(), status: "success", recordsProcessed: 0, message: "Disconnected by owner (simulated)" });
    },
    { success: `${i.name} disconnected` },
  );

  const connected = i.status === "connected" || i.status === "syncing";
  const syncing = i.status === "syncing";
  const history = useMemo(() => [...i.history].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [i.history]);

  const c = i.config;
  const summary = [
    { label: "Status", value: <StatusBadge status={i.status} /> },
    { label: "Connected since", value: i.connectedAt ? formatDateTime(i.connectedAt) : "—" },
    { label: "Last sync", value: i.lastSyncAt ? formatDateTime(i.lastSyncAt) : "Never" },
    ...(i.id === "shopify"
      ? [
          { label: "Store", value: (c.storeUrl as string) || "—" },
          { label: "Posts sales to", value: c.branchId ? branchName(c.branchId as string) : "—" },
          { label: "Schedule", value: SCHEDULE_LABEL[String(c.schedule)] ?? "—" },
        ]
      : i.id === "webill365"
        ? [
            { label: "Company ID", value: (c.companyId as string) || "—" },
            { label: "Auto-send invoices", value: c.autoSendInvoices ? "On" : "Off" },
          ]
        : [
            { label: "Bot", value: (c.botUsername as string) || "—" },
            { label: "Token", value: i.status === "disconnected" ? "—" : <span className="font-mono text-xs">{maskToken(c.botTokenLast4 as string | undefined)}</span> },
            { label: "Chat ID", value: (c.chatId as string) || "—" },
          ]),
  ];

  return (
    <>
      <PageHeader
        backHref="/integrations"
        backLabel="Integrations"
        title={
          <span className="flex items-center gap-3">
            <span className={cn("flex size-9 items-center justify-center rounded-lg", M.tint)}>
              <M.icon className="size-5" aria-hidden />
            </span>
            {i.name}
          </span>
        }
        meta={<StatusBadge status={i.status} />}
        description={i.description}
        actions={
          connected ? (
            <>
              <Button variant="outline" onClick={() => setDisconnectOpen(true)} disabled={syncing}>
                <Unplug /> Disconnect
              </Button>
              <Button onClick={() => sync.fire()} disabled={syncing || sync.pending}>
                {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            </>
          ) : i.status === "error" ? (
            <>
              <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                <Unplug /> Disconnect
              </Button>
              <Button onClick={() => setConnectOpen(true)}>
                <PlugZap /> Reconnect
              </Button>
            </>
          ) : (
            <Button onClick={() => setConnectOpen(true)}>
              <PlugZap /> Connect
            </Button>
          )
        }
      />

      <div className="space-y-6">
        {i.status === "error" && (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error-light p-4 sm:flex-row sm:items-center">
            <AlertOctagon className="size-5 shrink-0 text-error-text" aria-hidden />
            <div className="flex-1 text-sm">
              <p className="font-medium text-error-text">{i.name} connection error</p>
              <p className="text-error-text/90">{i.errorMessage ?? "The connection stopped working. Reconnect to resume."}</p>
            </div>
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <PlugZap /> Reconnect
            </Button>
          </div>
        )}
        {syncing && (
          <p role="status" className="flex items-center gap-2 rounded-lg border bg-info-light px-3 py-2 text-sm text-info-text">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Sync in progress (simulated)…
          </p>
        )}
        <DemoNotice>Simulated integration: connecting, syncing and disconnecting change demo state only. Sync runs don&apos;t import records in this demo.</DemoNotice>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <IntegrationConfigForm key={`${i.id}-${i.connectedAt ?? "none"}`} integration={i} />
          <Card className="h-fit gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Connection</CardTitle>
              <CardDescription>{M.category}</CardDescription>
            </CardHeader>
            <div className="p-5">
              <DetailList columns={1} items={summary} />
            </div>
          </Card>
        </div>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Sync history</CardTitle>
            <CardDescription>Most recent runs first.</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <DataTable bare columns={historyColumns} data={history} getRowId={(r) => r.id} pageSize={10} empty={<EmptyState compact icon={History} title="No sync runs yet" description={connected ? "Run “Sync now” to start the first sync." : "Connect this integration to start syncing."} />} />
          </div>
        </Card>
      </div>

      <ConnectDialog integration={i} open={connectOpen} onOpenChange={setConnectOpen} />
      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={`Disconnect ${i.name}?`}
        description={
          i.id === "shopify"
            ? "Online orders will stop syncing. Sales already imported stay in LedgerVision. You can reconnect at any time."
            : i.id === "telegram"
              ? "The bot will stop sending summaries and reminders. You can reconnect at any time."
              : "Invoices will no longer be sent through WeBill365. You can reconnect at any time."
        }
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => disconnect.run()}
      />
    </>
  );
}
