import type { Metadata } from "next";
import { ManagersPage } from "@/features/branches/managers-page";

export const metadata: Metadata = { title: "Branch managers" };

export default function Page() {
  return <ManagersPage />;
}
