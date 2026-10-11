import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { ImportHistoryPage } from "@/features/banking/import-history-page";

export const metadata: Metadata = { title: "Import history" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ImportHistoryPage />
    </Suspense>
  );
}
