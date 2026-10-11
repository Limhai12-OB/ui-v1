import { ReceiptText, Send, ShoppingBag, type LucideIcon } from "lucide-react";
import type { Integration, IntegrationId } from "@/types";

export const INTEGRATION_META: Record<IntegrationId, { icon: LucideIcon; tint: string; category: string; capabilities: string[] }> = {
  shopify: {
    icon: ShoppingBag,
    tint: "bg-success-light text-success-text",
    category: "Sales channel",
    capabilities: ["Online orders posted as sales to a branch", "Item stock levels kept in sync"],
  },
  webill365: {
    icon: ReceiptText,
    tint: "bg-info-light text-info-text",
    category: "E-invoicing",
    capabilities: ["Send invoices as e-invoices", "Receive supplier bills from the network"],
  },
  telegram: {
    icon: Send,
    tint: "bg-ai-light text-ai-text",
    category: "Messaging",
    capabilities: ["Daily financial summary to a chat", "Invoice and payment reminders"],
  },
};

export const SCHEDULE_LABEL: Record<string, string> = {
  hourly: "Every hour",
  every_6_hours: "Every 6 hours",
  daily: "Daily at 06:00",
  manual: "Manual only",
};

export const isIntegrationId = (id: string): id is IntegrationId => id === "shopify" || id === "webill365" || id === "telegram";

/** The external account an integration is linked to, for summaries. */
export function connectionAccount(i: Integration): string | undefined {
  const c = i.config;
  if (i.id === "shopify") return (c.storeUrl as string) || undefined;
  if (i.id === "webill365") return c.companyId ? `Company ${c.companyId}` : undefined;
  if (i.id === "telegram") return (c.botUsername as string) || undefined;
  return undefined;
}

export const maskToken = (last4?: string) => `••••••••••••${last4 ?? "••••"}`;
