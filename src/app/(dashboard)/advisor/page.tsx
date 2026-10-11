import type { Metadata } from "next";
import { AdvisorPage } from "@/features/ai-advisor/advisor-page";

export const metadata: Metadata = { title: "AI Financial Advisor" };

export default function Page() {
  return <AdvisorPage />;
}
