import type { Metadata } from "next";
import { WalkInSaleNewPage } from "@/features/sales/walk-in-sale-new-page";

export const metadata: Metadata = { title: "New walk-in sale" };

export default function Page() {
  return <WalkInSaleNewPage />;
}
