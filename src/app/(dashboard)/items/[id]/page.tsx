import type { Metadata } from "next";
import { ItemDetailPage } from "@/features/inventory/item-detail-page";

export const metadata: Metadata = { title: "Item" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemDetailPage id={id} />;
}
