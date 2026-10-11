import type { Metadata } from "next";
import { IntegrationDetail } from "@/features/integrations/integration-detail";

export const metadata: Metadata = { title: "Integration" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IntegrationDetail id={id} />;
}
