import type { Metadata } from "next";
import { PlannedPurchaseDetail } from "@/features/planned-purchases/planned-purchase-detail";

export const metadata: Metadata = { title: "Planned purchase" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlannedPurchaseDetail id={id} />;
}
