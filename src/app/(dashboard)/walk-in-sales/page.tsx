import type { Metadata } from "next";
import { WalkInSalesPage } from "@/features/sales/walk-in-sales-page";

export const metadata: Metadata = { title: "Walk-in sales" };

export default function Page() {
  return <WalkInSalesPage />;
}
