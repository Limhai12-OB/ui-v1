"use client";

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { DashboardSectionId } from "@/types";
import { DEFAULT_DASHBOARD_LAYOUT, useUIStore } from "@/store/ui-store";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const SECTION_META: Record<DashboardSectionId, { label: string; description: string }> = {
  kpis: { label: "Key figures", description: "Revenue, expenses, profit, margin, receivables and payables" },
  health: { label: "Business health score", description: "Overall score and six contributing factors" },
  charts: { label: "Income & spending charts", description: "Trends over 30 days, 90 days or 6 months" },
  alerts: { label: "Needs attention", description: "Overdue, due-soon, stock and review items" },
  transactions: { label: "Recent transactions", description: "The latest 8 transactions" },
};

export function CustomizeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { layout, toggle, move, reset } = useUIStore(
    useShallow((s) => ({ layout: s.dashboardLayout, toggle: s.toggleDashboardSection, move: s.moveDashboardSection, reset: s.resetDashboardLayout })),
  );
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_DASHBOARD_LAYOUT);
  const visibleCount = layout.order.filter((id) => !layout.hidden.includes(id)).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Customize dashboard</SheetTitle>
          <SheetDescription>Show, hide and reorder sections. Changes save automatically on this device.</SheetDescription>
        </SheetHeader>
        <ol className="flex-1 space-y-2 overflow-y-auto p-5" aria-label="Dashboard sections">
          {layout.order.map((id, i) => {
            const shown = !layout.hidden.includes(id);
            const M = SECTION_META[id];
            const switchId = `dash-section-${id}`;
            return (
              <li key={id} className={cn("flex items-center gap-3 rounded-lg border bg-card p-3", !shown && "bg-muted/40")}>
                <span className="w-5 text-center text-xs font-medium text-muted-foreground tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={switchId} className={cn("block text-sm font-medium", !shown && "text-muted-foreground")}>
                    {M.label}
                  </label>
                  <p className="truncate text-xs text-muted-foreground">{shown ? M.description : "Hidden"}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${M.label} up`}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(id, 1)} disabled={i === layout.order.length - 1} aria-label={`Move ${M.label} down`}>
                    <ArrowDown />
                  </Button>
                </div>
                <Switch id={switchId} checked={shown} onCheckedChange={() => toggle(id)} disabled={shown && visibleCount === 1} aria-label={`Show ${M.label}`} />
              </li>
            );
          })}
        </ol>
        <SheetFooter className="flex-row justify-between border-t p-5">
          <Button variant="outline" onClick={reset} disabled={isDefault}>
            <RotateCcw /> Reset to default
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
