import { Suspense } from "react";
import type { Metadata } from "next";
import { InviteManagerPage } from "@/features/branches/invite-manager-page";
import { PageSkeleton } from "@/components/shared/states";

export const metadata: Metadata = { title: "Invite branch manager" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InviteManagerPage />
    </Suspense>
  );
}
