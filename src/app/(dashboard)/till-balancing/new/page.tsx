import type { Metadata } from "next";
import { TillNewPage } from "@/features/till/till-form-page";

export const metadata: Metadata = { title: "Count till" };

export default function Page() {
  return <TillNewPage />;
}
