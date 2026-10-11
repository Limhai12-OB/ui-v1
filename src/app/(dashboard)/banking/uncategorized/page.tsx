import type { Metadata } from "next";
import { UncategorizedPage } from "@/features/banking/uncategorized-page";

export const metadata: Metadata = { title: "Uncategorized transactions" };

export default function Page() {
  return <UncategorizedPage />;
}
