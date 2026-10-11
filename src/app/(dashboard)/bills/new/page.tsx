import type { Metadata } from "next";
import { NewBillPage } from "@/features/bills/new-bill-page";

export const metadata: Metadata = { title: "New bill" };

export default function Page() {
  return <NewBillPage />;
}
