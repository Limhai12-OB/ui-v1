import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/states";
import { AccountDetail } from "@/features/banking/accounts/account-detail";

export const metadata: Metadata = { title: "Account dashboard" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountDetail id={id} />
    </Suspense>
  );
}
