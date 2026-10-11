import type { Metadata } from "next";
import { BillsPage } from "@/features/bills/bills-page";

export const metadata: Metadata = { title: "Bills" };

export default function Page() {
  return <BillsPage />;
}
