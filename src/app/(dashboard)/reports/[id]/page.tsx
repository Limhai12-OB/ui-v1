import type { Metadata } from "next";
import { ReportDetail } from "@/features/reports/report-detail";

export const metadata: Metadata = { title: "Monthly Report" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReportDetail id={id} />;
}
