import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/shared/states";
import { TransactionForm } from "@/features/transactions/transaction-form";

export const metadata: Metadata = { title: "New transaction" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TransactionForm />
    </Suspense>
  );
}
