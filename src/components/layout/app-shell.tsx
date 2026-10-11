"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSessionStore } from "@/store/session-store";
import { useCurrentUser } from "@/hooks/use-scope";
import { canAccessRoute } from "@/lib/permissions";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

function AccessDenied() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      description="This area is available to the Business Owner only. If you need access, ask the owner to update your permissions."
      action={
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      }
      className="min-h-[60vh]"
    />
  );
}

/** Authenticated application shell: sidebar + top bar + guarded content. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();

  useEffect(() => {
    if (hydrated && status !== "signed_in") router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, status, router, pathname]);

  if (!hydrated || status !== "signed_in") {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r bg-sidebar lg:block" />
        <main className="flex-1 p-6">
          <PageSkeleton />
        </main>
      </div>
    );
  }

  const allowed = canAccessRoute(user.role, pathname);

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {allowed ? children : <AccessDenied />}
        </main>
      </div>
    </div>
  );
}
