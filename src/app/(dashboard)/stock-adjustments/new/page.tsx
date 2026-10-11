import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/states";
import { StockAdjustmentNewPage } from "@/features/inventory/stock-adjustment-new-page";

export const metadata: Metadata = { title: "New stock adjustment" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StockAdjustmentNewPage />
    </Suspense>
  );
}
