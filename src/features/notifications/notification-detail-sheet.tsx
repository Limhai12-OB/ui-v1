"use client";

import Link from "next/link";
import { ArrowRight, Circle, MailOpen } from "lucide-react";
import type { AppNotification } from "@/types";
import { useLookups } from "@/hooks/use-lookup";
import { formatDateTime } from "@/lib/date";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DetailList } from "@/components/shared/detail-list";
import { cn } from "@/lib/utils";
import { NOTIFICATION_SEVERITY } from "./notification-meta";

export function NotificationDetailSheet({ notification: n, onOpenChange, onToggleRead }: { notification?: AppNotification; onOpenChange: (o: boolean) => void; onToggleRead: (n: AppNotification) => void }) {
  const { branchName } = useLookups();
  const S = n ? NOTIFICATION_SEVERITY[n.severity] : undefined;
  return (
    <Sheet open={!!n} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {n && S && (
          <>
            <SheetHeader className="border-b p-5 pr-12">
              <span className={cn("mb-2 inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", S.className)}>
                <S.icon className="size-3" aria-hidden />
                {S.label}
              </span>
              <SheetTitle className="text-base">{n.title}</SheetTitle>
              <SheetDescription>{formatDateTime(n.createdAt)}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <p className="text-sm leading-relaxed whitespace-pre-line">{n.body}</p>
              <DetailList
                columns={2}
                items={[
                  { label: "Category", value: n.category === "financial" ? "Financial" : "System" },
                  { label: "Branch", value: n.branchId ? branchName(n.branchId) : "All branches" },
                  { label: "Status", value: n.read ? "Read" : "Unread" },
                  { label: "Received", value: formatDateTime(n.createdAt) },
                ]}
              />
            </div>
            <SheetFooter className="flex-row flex-wrap justify-between gap-2 border-t p-5">
              <Button variant="outline" onClick={() => onToggleRead(n)}>
                {n.read ? <Circle /> : <MailOpen />}
                {n.read ? "Mark as unread" : "Mark as read"}
              </Button>
              {n.href && (
                <Button asChild>
                  <Link href={n.href}>
                    Open related record <ArrowRight />
                  </Link>
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
