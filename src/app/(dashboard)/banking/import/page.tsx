import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { StatementImportPage } from "@/features/banking/statement-import/statement-import-page";

export const metadata: Metadata = { title: "Import bank statement" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StatementImportPage />
    </Suspense>
  );
}
