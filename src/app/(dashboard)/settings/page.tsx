import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings/settings-page";
import { PageSkeleton } from "@/components/shared/states";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsPage />
    </Suspense>
  );
}
