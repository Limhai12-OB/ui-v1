import type { Metadata } from "next";
import { PlannedPurchasesPage } from "@/features/planned-purchases/planned-purchases-page";

export const metadata: Metadata = { title: "Planned purchases" };

export default function Page() {
  return <PlannedPurchasesPage />;
}
