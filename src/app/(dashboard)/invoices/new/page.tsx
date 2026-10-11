import type { Metadata } from "next";
import { InvoiceNewPage } from "@/features/invoices/invoice-new-page";

export const metadata: Metadata = { title: "New invoice" };

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  return <InvoiceNewPage customerId={customer} />;
}
