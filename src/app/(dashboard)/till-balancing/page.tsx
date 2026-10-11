import type { Metadata } from "next";
import { TillListPage } from "@/features/till/till-list-page";

export const metadata: Metadata = { title: "Till balancing" };

export default function Page() {
  return <TillListPage />;
}
