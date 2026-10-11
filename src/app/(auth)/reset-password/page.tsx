import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordPage } from "@/features/authentication/reset-password-page";
import { AuthSkeleton } from "@/features/authentication/auth-ui";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <ResetPasswordPage />
    </Suspense>
  );
}
