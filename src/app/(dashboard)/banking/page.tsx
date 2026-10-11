import type { Metadata } from "next";
import { BankingPage } from "@/features/banking/banking-page";

export const metadata: Metadata = { title: "Banking" };

export default function Page() {
  return <BankingPage />;
}
