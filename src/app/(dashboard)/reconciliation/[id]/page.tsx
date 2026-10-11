import type { Metadata } from "next";
import { ReconciliationDetailPage } from "@/features/reconciliation/reconciliation-detail-page";

export const metadata: Metadata = { title: "Reconciliation" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReconciliationDetailPage id={id} />;
}
