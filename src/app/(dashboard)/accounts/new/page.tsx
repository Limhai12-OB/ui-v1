import type { Metadata } from "next";
import { AccountForm } from "@/features/banking/accounts/account-form";

export const metadata: Metadata = { title: "New financial account" };

export default function Page() {
  return <AccountForm />;
}
