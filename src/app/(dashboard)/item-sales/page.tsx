import type { Metadata } from "next";
import { ItemSalesPage } from "@/features/sales/item-sales-page";

export const metadata: Metadata = { title: "Item sales" };

export default function Page() {
  return <ItemSalesPage />;
}
