import type { Metadata } from "next";
import { SignUpPage } from "@/features/authentication/sign-up-page";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return <SignUpPage />;
}
