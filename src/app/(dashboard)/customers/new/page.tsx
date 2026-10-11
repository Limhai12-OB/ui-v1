import type { Metadata } from "next";
import { CustomerNewPage } from "@/features/customers/customer-new-page";

export const metadata: Metadata = { title: "New customer" };

export default function Page() {
  return <CustomerNewPage />;
}
