"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/session-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { Logo } from "@/components/layout/logo";

export default function Home() {
  const router = useRouter();
  const hydrated = useHydrated();
  const status = useSessionStore((s) => s.status);
  useEffect(() => {
    if (!hydrated) return;
    router.replace(status === "signed_in" ? "/dashboard" : "/sign-in");
  }, [hydrated, status, router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Logo />
    </main>
  );
}
