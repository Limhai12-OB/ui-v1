import type { Metadata } from "next";
import { BillDetailPage } from "@/features/bills/bill-detail-page";

export const metadata: Metadata = { title: "Bill" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillDetailPage id={id} />;
}
