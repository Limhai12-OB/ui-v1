import { Suspense } from "react";
import type { Metadata } from "next";
import { AcceptInvitationPage } from "@/features/authentication/accept-invitation-page";
import { AuthSkeleton } from "@/features/authentication/auth-ui";

export const metadata: Metadata = { title: "Accept invitation" };

export default function Page() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AcceptInvitationPage />
    </Suspense>
  );
}
