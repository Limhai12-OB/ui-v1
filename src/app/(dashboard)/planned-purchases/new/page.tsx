import type { Metadata } from "next";
import { PlannedPurchaseNewPage } from "@/features/planned-purchases/planned-purchase-new-page";

export const metadata: Metadata = { title: "New planned purchase" };

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  return <PlannedPurchaseNewPage customerId={customer} />;
}
