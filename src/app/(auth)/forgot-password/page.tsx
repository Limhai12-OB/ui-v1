import type { Metadata } from "next";
import { ForgotPasswordPage } from "@/features/authentication/forgot-password-page";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <ForgotPasswordPage />;
}
