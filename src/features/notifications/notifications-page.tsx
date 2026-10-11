"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { BellOff, CheckCheck, Circle, MailOpen, Settings2 } from "lucide-react";
import type { AppNotification } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { useAction } from "@/hooks/use-action";
import { useInitialLoad } from "@/hooks/use-initial-load";
import { notificationService } from "@/lib/api";
import { canAccessRoute } from "@/lib/permissions";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { NOTIFICATION_SEVERITY } from "./notification-meta";
import { NotificationDetailSheet } from "./notification-detail-sheet";

type Tab = "all" | "financial" | "system";

const localDay = (iso: string) => format(parseISO(iso), "yyyy-MM-dd");

function dayHeading(day: string) {
  if (day === today()) return "Today";
  if (day === addDaysISO(today(), -1)) return "Yesterday";
  return formatDate(day, "EEEE, d MMMM yyyy");
}

/** Notifications visible to the current user: in branch scope and linking only to routes they can open. */
export function useVisibleNotifications() {
  const all = useAppStore((s) => s.notifications);
  const { inScope, user } = useScope();
  return useMemo(() => all.filter((n) => (!n.branchId || inScope(n.branchId)) && (!n.href || canAccessRoute(user.role, n.href.split("?")[0]))), [all, inScope, user.role]);
}

export function NotificationsPage() {
  const loading = useInitialLoad();
  const visible = useVisibleNotifications();
  const { branchName } = useLookups();
  const [tab, setTab] = useState<Tab>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleRead = useAction((n: AppNotification) => notificationService.markRead(n.id, !n.read));
  const markOpened = useAction((id: string) => notificationService.markRead(id, true));
  const markAll = useAction(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => notificationService.markRead(id, true)));
      return ids.length;
    },
    { success: (n) => `${n} notification${n === 1 ? "" : "s"} marked as read` },
  );

  const counts = useMemo(() => {
    const unread = (c?: Tab) => visible.filter((n) => !n.read && (!c || c === "all" || n.category === c)).length;
    return { all: unread("all"), financial: unread("financial"), system: unread("system") };
  }, [visible]);

  const inTab = useMemo(() => visible.filter((n) => tab === "all" || n.category === tab), [visible, tab]);
  const list = useMemo(() => (unreadOnly ? inTab.filter((n) => !n.read) : inTab).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [inTab, unreadOnly]);
  const groups = useMemo(() => {
    const m = new Map<string, AppNotification[]>();
    for (const n of list) {
      const d = localDay(n.createdAt);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(n);
    }
    return [...m.entries()];
  }, [list]);

  const unreadInTab = inTab.filter((n) => !n.read).map((n) => n.id);
  const opened = visible.find((n) => n.id === openId);
  const tabName = tab === "all" ? "" : tab === "financial" ? " financial" : " system";

  const open = (n: AppNotification) => {
    setOpenId(n.id);
    if (!n.read) markOpened.fire(n.id);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Financial alerts and system events for the branches you can access."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/notifications/preferences">
                <Settings2 /> Preferences
              </Link>
            </Button>
            <Button onClick={() => markAll.fire(unreadInTab)} disabled={unreadInTab.length === 0 || markAll.pending}>
              <CheckCheck /> Mark all{tabName} as read
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {(["all", "financial", "system"] as Tab[]).map((t) => (
              <TabsTrigger key={t} value={t}>
                {t === "all" ? "All" : t === "financial" ? "Financial" : "System"}
                {counts[t] > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
                    {counts[t]}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
          <Label htmlFor="unread-only" className="text-sm">
            Unread only
          </Label>
        </div>
      </div>

      <Card className="gap-0 py-0">
        {loading ? (
          <ul className="divide-y" aria-busy="true" aria-label="Loading notifications">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex gap-3 px-5 py-4">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </li>
            ))}
          </ul>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={unreadOnly ? MailOpen : BellOff}
            title={unreadOnly ? `No unread${tabName} notifications` : `No${tabName} notifications`}
            description={unreadOnly ? "You're all caught up. Turn off “Unread only” to see earlier notifications." : tab === "system" ? "Integration, import and account events will appear here." : "Overdue invoices, due bills, stock and review alerts will appear here."}
            action={
              unreadOnly && inTab.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setUnreadOnly(false)}>
                  Show all
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map(([day, items]) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="border-b bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground">
                {dayHeading(day)}
              </h2>
              <ul className="divide-y border-b last:border-b-0">
                {items.map((n) => {
                  const S = NOTIFICATION_SEVERITY[n.severity];
                  return (
                    <li key={n.id} className={cn("group relative flex gap-3 px-5 py-3.5 hover:bg-muted/40", !n.read && "bg-primary-light/30")}>
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", S.className)}>
                        <S.icon className="size-4" aria-hidden />
                      </span>
                      <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset">
                        <span className="flex items-center gap-2">
                          {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                          <span className={cn("truncate text-sm", n.read ? "text-foreground" : "font-semibold")}>{n.title}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="sr-only">{S.label}. {n.read ? "Read" : "Unread"}.</span>
                          <time dateTime={n.createdAt} className="tabular-nums">
                            {format(parseISO(n.createdAt), "HH:mm")}
                          </time>
                          <span aria-hidden>·</span>
                          <span>{n.category === "financial" ? "Financial" : "System"}</span>
                          <span aria-hidden>·</span>
                          <span>{n.branchId ? branchName(n.branchId) : "All branches"}</span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="relative z-10 shrink-0 self-center"
                        onClick={() => toggleRead.fire(n)}
                        aria-label={n.read ? `Mark “${n.title}” as unread` : `Mark “${n.title}” as read`}
                        title={n.read ? "Mark as unread" : "Mark as read"}
                      >
                        {n.read ? <Circle /> : <MailOpen />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </Card>

      <NotificationDetailSheet notification={opened} onOpenChange={(o) => !o && setOpenId(null)} onToggleRead={(n) => toggleRead.fire(n)} />
    </>
  );
}
