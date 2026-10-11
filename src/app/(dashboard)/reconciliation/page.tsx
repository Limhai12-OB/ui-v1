import type { Metadata } from "next";
import { ReconciliationListPage } from "@/features/reconciliation/reconciliation-list-page";

export const metadata: Metadata = { title: "Reconciliation" };

export default function Page() {
  return <ReconciliationListPage />;
}
