import type { Metadata } from "next";
import { ItemFormPage } from "@/features/inventory/item-form";

export const metadata: Metadata = { title: "New item" };

export default function Page() {
  return <ItemFormPage />;
}
