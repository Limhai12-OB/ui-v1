import type { Metadata } from "next";
import { ItemFormPage } from "@/features/inventory/item-form";

export const metadata: Metadata = { title: "Edit item" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemFormPage itemId={id} />;
}
