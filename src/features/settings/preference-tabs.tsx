"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { CalendarClock, Check, Database, EyeOff, LayoutDashboard, Moon, PanelLeft, RotateCcw, Server, Sun, UserCog } from "lucide-react";
import type { DashboardSectionId } from "@/types";
import { DEFAULT_DASHBOARD_LAYOUT, useUIStore } from "@/store/ui-store";
import { useAppStore } from "@/store/app-store";
import { API_MODE, AI_API_URL, CORE_API_URL } from "@/lib/api/config";
import { DEMO_TODAY, formatDate } from "@/lib/date";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DemoNotice } from "@/components/shared/demo-notice";
import { DetailList } from "@/components/shared/detail-list";
import { cn } from "@/lib/utils";

const SECTION_LABEL: Record<DashboardSectionId, string> = {
  kpis: "Key figures",
  health: "Business health score",
  charts: "Income & spending charts",
  alerts: "Needs attention",
  transactions: "Recent transactions",
};

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

export function AppearanceTab() {
  const { theme, setTheme, collapsed, toggleSidebar } = useUIStore(useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme, collapsed: s.sidebarCollapsed, toggleSidebar: s.toggleSidebar })));
  const options = [
    { value: "light" as const, label: "Light", icon: Sun, description: "Bright surfaces, best in well-lit shops and offices." },
    { value: "dark" as const, label: "Dark", icon: Moon, description: "Low-glare surfaces for evening till counts." },
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme</CardTitle>
          <CardDescription>Saved on this device only.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-2">
            {options.map((o) => {
              const active = theme === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(o.value)}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active && "border-primary bg-primary-light/40",
                  )}
                >
                  <ThemePreview dark={o.value === "dark"} />
                  <span className="flex items-start justify-between gap-2">
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <o.icon className="size-4" aria-hidden /> {o.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Layout</CardTitle>
          <CardDescription>Workspace density on this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="collapse-sidebar" className="flex items-center gap-1.5 text-sm font-medium">
                <PanelLeft className="size-4" aria-hidden /> Collapsed sidebar
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Show navigation as icons only on large screens to give tables more room.</p>
            </div>
            <Switch id="collapse-sidebar" checked={collapsed} onCheckedChange={toggleSidebar} />
          </div>
          <p className="text-xs text-muted-foreground">
            Looking for the interface language? It’s under{" "}
            <Link href="/settings?tab=currency" className="font-medium text-primary hover:underline">
              Currency &amp; language
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Abstract mini-preview drawn with fixed palette swatches for each theme (decorative). */
function ThemePreview({ dark }: { dark: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-20 w-full overflow-hidden rounded-md border", dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50")}>
      <span className={cn("w-1/4 border-r", dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white")} />
      <span className="flex flex-1 flex-col gap-1.5 p-2">
        <span className={cn("h-2 w-1/2 rounded", dark ? "bg-slate-600" : "bg-slate-300")} />
        <span className="flex gap-1.5">
          <span className={cn("h-6 flex-1 rounded", dark ? "bg-slate-800" : "bg-white")} />
          <span className={cn("h-6 flex-1 rounded", dark ? "bg-slate-800" : "bg-white")} />
        </span>
        <span className="h-1.5 w-1/3 rounded bg-primary" />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export function DashboardTab() {
  const { layout, reset } = useUIStore(useShallow((s) => ({ layout: s.dashboardLayout, reset: s.resetDashboardLayout })));
  const [confirm, setConfirm] = useState(false);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_DASHBOARD_LAYOUT);
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Dashboard layout
          {isDefault ? <Badge variant="neutral">Default</Badge> : <Badge variant="info">Customized</Badge>}
        </CardTitle>
        <CardDescription>Section order and visibility for your dashboard on this device. Customize it from the dashboard’s “Customize” panel.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y rounded-lg border">
          {layout.order.map((id, i) => {
            const hidden = layout.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className={cn("flex-1", hidden && "text-muted-foreground")}>{SECTION_LABEL[id] ?? id}</span>
                {hidden ? (
                  <Badge variant="neutral">
                    <EyeOff /> Hidden
                  </Badge>
                ) : (
                  <Badge variant="success">
                    <Check /> Shown
                  </Badge>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2 border-t">
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <LayoutDashboard /> Open dashboard
          </Link>
        </Button>
        <Button variant="secondary" disabled={isDefault} onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset layout
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset dashboard layout?"
        description="All sections will be shown again in the default order. Your data isn’t affected."
        confirmLabel="Reset layout"
        onConfirm={() => {
          reset();
          toast.success("Dashboard layout reset");
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Demo & data                                                         */
/* ------------------------------------------------------------------ */

export function DemoDataTab() {
  const [confirm, setConfirm] = useState(false);
  const counts = useAppStore(
    useShallow((s) => ({ transactions: s.transactions.length, invoices: s.invoices.length, items: s.items.length, branches: s.branches.length })),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-muted-foreground" aria-hidden /> Reset demo data
          </CardTitle>
          <CardDescription>Restore the original Angkor Fresh Mart sample dataset. Everything you created or changed in this browser is discarded.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Currently stored in this browser: <span className="font-medium text-foreground tabular-nums">{counts.transactions.toLocaleString("en-US")}</span> transactions, <span className="font-medium text-foreground tabular-nums">{counts.invoices}</span> invoices, <span className="font-medium text-foreground tabular-nums">{counts.items}</span> items across{" "}
            <span className="font-medium text-foreground tabular-nums">{counts.branches}</span> branches.
          </p>
          <DemoNotice>Your theme, language and dashboard layout are kept. You stay signed in.</DemoNotice>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <RotateCcw /> Reset demo data
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="size-4 text-muted-foreground" aria-hidden /> Environment
          </CardTitle>
          <CardDescription>How this frontend is connected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <DetailList
            columns={1}
            items={[
              {
                label: "API mode",
                value: (
                  <span className="flex items-center gap-2">
                    <Badge variant={API_MODE === "mock" ? "info" : "success"}>{API_MODE === "mock" ? "Mock" : "Live"}</Badge>
                    <span className="text-xs text-muted-foreground">{API_MODE === "mock" ? "Services resolve against local demo data in your browser." : "Services call the backend APIs."}</span>
                  </span>
                ),
              },
              { label: "Core API (Spring Boot)", value: <code className="font-mono text-xs break-all">{CORE_API_URL}</code> },
              { label: "AI API (FastAPI)", value: <code className="font-mono text-xs break-all">{AI_API_URL}</code> },
              {
                label: "Demo clock",
                value: (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="tabular-nums">{formatDate(DEMO_TODAY, "EEEE, dd MMM yyyy")}</span>
                  </span>
                ),
              },
            ]}
          />
          <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
            <UserCog className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Switching roles:</span> open the account menu in the top bar and pick a <span className="font-medium">Demo role</span> to switch between the Business Owner (Sophea) and the Toul Kork branch manager (Dara). Managers see only their branch and can’t open owner-only areas.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset all demo data?"
        description="This restores the original sample business and permanently discards every record you added or changed in this browser. This can’t be undone."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 400));
          useAppStore.getState().resetDemoData();
          toast.success("Demo data reset", { description: "The original sample dataset has been restored." });
        }}
      />
    </div>
  );
}
