"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAV_GROUPS, isNavItemActive, type NavItem } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { useCurrentUser } from "@/hooks/use-scope";
import { useT } from "@/hooks/use-t";
import { useUIStore } from "@/store/ui-store";
import { useAppStore } from "@/store/app-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

function useVisibleGroups() {
  const user = useCurrentUser();
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(user.role, i.permission)) })).filter((g) => g.items.length > 0);
}

function NavLink({ item, collapsed, onNavigate, badge }: { item: NavItem; collapsed: boolean; onNavigate?: () => void; badge?: number }) {
  const pathname = usePathname();
  const t = useT();
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;
  const label = t(item.labelKey);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
      <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto rounded-md bg-primary-light px-1.5 text-[11px] font-semibold text-primary tabular-nums">{badge}</span>
      ) : null}
      {collapsed && badge ? <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-destructive" aria-hidden /> : null}
      {collapsed && <span className="sr-only">{label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const groups = useVisibleGroups();
  const t = useT();
  const collapsedGroups = useUIStore((s) => s.collapsedNavGroups);
  const toggleGroup = useUIStore((s) => s.toggleNavGroup);
  const unread = useAppStore((s) => s.notifications.filter((n) => !n.read).length);
  const review = useAppStore((s) => s.transactions.filter((tx) => tx.status === "needs_review").length);

  const badgeFor = (href: string) => (href === "/notifications" ? unread : href === "/banking" ? review : undefined);

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4 px-3 py-2">
      {groups.map((g) => {
        const isCollapsed = !collapsed && collapsedGroups.includes(g.id);
        return (
          <div key={g.id}>
            {collapsed ? (
              <div className="mx-2 mb-2 h-px bg-border first:hidden" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                aria-expanded={!isCollapsed}
                className="mb-1 flex w-full items-center justify-between rounded px-2.5 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
              >
                {t(g.labelKey)}
                <ChevronDown className={cn("size-3.5 transition-transform", isCollapsed && "-rotate-90")} aria-hidden />
              </button>
            )}
            {!isCollapsed && (
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} badge={badgeFor(item.href)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-64")}>
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        <Link href="/dashboard" className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="LedgerVision dashboard">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <SidebarNav collapsed={collapsed} />
      </ScrollArea>
      <div className={cn("border-t p-3", collapsed && "flex justify-center")}>
        <Button variant="ghost" size={collapsed ? "icon" : "sm"} onClick={toggle} className={cn(!collapsed && "w-full justify-start text-muted-foreground")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
