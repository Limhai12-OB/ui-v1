import type { Metadata } from "next";
import { AccountsPage } from "@/features/banking/accounts/accounts-page";

export const metadata: Metadata = { title: "Financial accounts" };

export default function Page() {
  return <AccountsPage />;
}
