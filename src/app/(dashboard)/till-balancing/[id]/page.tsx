import type { Metadata } from "next";
import { TillDetailPage } from "@/features/till/till-detail-page";

export const metadata: Metadata = { title: "Till count" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TillDetailPage id={id} />;
}
