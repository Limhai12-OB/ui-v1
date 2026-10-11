import type { Metadata } from "next";
import { VerifyEmailPage } from "@/features/authentication/verify-email-page";

export const metadata: Metadata = { title: "Verify email" };

export default function Page() {
  return <VerifyEmailPage />;
}
