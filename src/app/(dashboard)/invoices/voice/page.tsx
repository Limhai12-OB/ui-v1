import type { Metadata } from "next";
import { VoiceInvoicePage } from "@/features/invoices/voice/voice-invoice-page";

export const metadata: Metadata = { title: "Voice-to-Invoice" };

export default function Page() {
  return <VoiceInvoicePage />;
}
