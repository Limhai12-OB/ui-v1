import type { Metadata } from "next";
import { BusinessSetupPage } from "@/features/authentication/business-setup-page";

export const metadata: Metadata = { title: "Business setup" };

export default function Page() {
  return <BusinessSetupPage />;
}
