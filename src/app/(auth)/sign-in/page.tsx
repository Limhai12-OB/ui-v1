import { Suspense } from "react";
import type { Metadata } from "next";
import { SignInPage } from "@/features/authentication/sign-in-page";
import { AuthSkeleton } from "@/features/authentication/auth-ui";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SignInPage />
    </Suspense>
  );
}
