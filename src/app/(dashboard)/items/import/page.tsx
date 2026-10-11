import type { Metadata } from "next";
import { ItemImportPage } from "@/features/inventory/item-import-page";

export const metadata: Metadata = { title: "Bulk item import" };

export default function Page() {
  return <ItemImportPage />;
}
