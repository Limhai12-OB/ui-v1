import type { Metadata } from "next";
import { NewReconciliationPage } from "@/features/reconciliation/new-reconciliation-page";

export const metadata: Metadata = { title: "Start reconciliation" };

export default function Page() {
  return <NewReconciliationPage />;
}
