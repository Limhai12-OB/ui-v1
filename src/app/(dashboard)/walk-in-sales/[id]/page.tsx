import type { Metadata } from "next";
import { WalkInSaleDetailPage } from "@/features/sales/walk-in-sale-detail-page";

export const metadata: Metadata = { title: "Walk-in sale" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WalkInSaleDetailPage id={id} />;
}
