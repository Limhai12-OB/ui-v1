import type { Metadata } from "next";
import { InvoiceEditPage } from "@/features/invoices/invoice-edit-page";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceEditPage id={id} />;
}
