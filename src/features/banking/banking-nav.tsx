"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/banking", label: "Overview" },
  { href: "/banking/import", label: "Import statement" },
  { href: "/banking/import-history", label: "Import history" },
  { href: "/banking/uncategorized", label: "Uncategorized" },
  { href: "/accounts", label: "Accounts" },
];

/** Count of imported transactions awaiting category review in the current scope. */
export function useReviewCount(): number {
  const transactions = useAppStore((s) => s.transactions);
  const { inScope } = useScope();
  return useMemo(() => transactions.filter((t) => t.status === "needs_review" && inScope(t.branchId)).length, [transactions, inScope]);
}

/** Tabs-like sub-navigation shared by the banking pages. */
export function BankingNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const review = useReviewCount();
  return (
    <nav aria-label="Banking" className={cn("-mt-2 mb-6 overflow-x-auto border-b", className)}>
      <ul className="flex min-w-max gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/banking" ? pathname === "/banking" : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 rounded-t-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active ? "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
                {l.href === "/banking/uncategorized" && review > 0 && (
                  <span className="rounded-full bg-warning-light px-1.5 text-[11px] font-semibold text-warning-text tabular-nums" aria-label={`${review} need review`}>
                    {review}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
