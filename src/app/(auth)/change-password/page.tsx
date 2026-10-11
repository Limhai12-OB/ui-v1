import type { Metadata } from "next";
import { ChangePasswordPage } from "@/features/authentication/change-password-page";

export const metadata: Metadata = { title: "Change password" };

export default function Page() {
  return <ChangePasswordPage />;
}
