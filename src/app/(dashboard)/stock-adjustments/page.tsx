import type { Metadata } from "next";
import { StockAdjustmentsPage } from "@/features/inventory/stock-adjustments-page";

export const metadata: Metadata = { title: "Stock adjustments" };

export default function Page() {
  return <StockAdjustmentsPage />;
}
