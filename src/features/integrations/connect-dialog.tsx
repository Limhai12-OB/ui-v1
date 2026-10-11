"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Integration } from "@/types";
import { integrationService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { nowISO } from "@/lib/date";
import { uid } from "@/store/app-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldDescribedBy } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";

export const SHOPIFY_URL = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
export const TELEGRAM_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
export const TELEGRAM_CHAT = /^-?\d{5,}$/;

const schema = z.object({
  primary: z.string().trim(),
  secondary: z.string().trim(),
});
type Values = z.infer<typeof schema>;

interface ConnectCopy {
  title: string;
  description: string;
  primary: { label: string; placeholder: string; helper: string; type?: string; validate: (v: string) => string | undefined };
  secondary: { label: string; placeholder: string; helper: string; type?: string; validate: (v: string) => string | undefined };
}

function copyFor(i: Integration, reconnect: boolean): ConnectCopy {
  const verb = reconnect ? "Reconnect" : "Connect";
  if (i.id === "shopify")
    return {
      title: `${verb} Shopify`,
      description: "Enter your store address, then authorize LedgerVision to read orders and inventory.",
      primary: { label: "Store URL", placeholder: "yourstore.myshopify.com", helper: "Your .myshopify.com address", validate: (v) => (SHOPIFY_URL.test(v.toLowerCase()) ? undefined : "Enter an address like yourstore.myshopify.com") },
      secondary: { label: "Admin API access token", placeholder: "shpat_…", helper: "From Shopify admin → Apps → Develop apps", type: "password", validate: (v) => (v.length >= 10 ? undefined : "Enter the access token (at least 10 characters)") },
    };
  if (i.id === "webill365")
    return {
      title: `${verb} WeBill365`,
      description: "Link your WeBill365 company to send e-invoices and receive supplier bills.",
      primary: { label: "Company ID", placeholder: "e.g. KH-1029384", helper: "Shown in WeBill365 under Company profile", validate: (v) => (/^[A-Za-z0-9-]{4,24}$/.test(v) ? undefined : "Enter a 4–24 character company ID") },
      secondary: { label: "API key", placeholder: "wb365_…", helper: "Created in WeBill365 → Settings → API", type: "password", validate: (v) => (v.length >= 12 ? undefined : "Enter the API key (at least 12 characters)") },
    };
  return {
    title: `${verb} Telegram bot`,
    description: reconnect ? "Paste a new bot token from BotFather to restore delivery." : "Paste your bot token from BotFather and the chat that should receive messages.",
    primary: { label: "Bot token", placeholder: "123456789:AA…", helper: "From @BotFather → /token", type: "password", validate: (v) => (TELEGRAM_TOKEN.test(v) ? undefined : "Enter a token like 123456789:AAH…(at least 30 characters after the colon)") },
    secondary: { label: "Chat ID", placeholder: "-1001234567890", helper: "Group or channel ID that receives messages", validate: (v) => (TELEGRAM_CHAT.test(v) ? undefined : "Enter a numeric chat ID, e.g. -1001234567890") },
  };
}

export function ConnectDialog({ integration: i, open, onOpenChange }: { integration: Integration; open: boolean; onOpenChange: (o: boolean) => void }) {
  const reconnect = i.status === "error";
  const copy = copyFor(i, reconnect);
  const defaults = (): Values => ({
    primary: i.id === "shopify" ? String(i.config.storeUrl ?? "") : i.id === "webill365" ? String(i.config.companyId ?? "") : "",
    secondary: i.id === "telegram" ? String(i.config.chatId ?? "") : "",
  });
  const form = useForm<Values>({
    resolver: zodResolver(
      schema.superRefine((v, ctx) => {
        const a = copy.primary.validate(v.primary);
        if (a) ctx.addIssue({ code: "custom", path: ["primary"], message: a });
        const b = copy.secondary.validate(v.secondary);
        if (b) ctx.addIssue({ code: "custom", path: ["secondary"], message: b });
      }),
    ),
    mode: "onTouched",
    defaultValues: defaults(),
  });
  const { register, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (open) reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  const authorize = useAction(
    async (v: Values) => {
      const at = nowISO();
      const config: Integration["config"] = { ...i.config };
      if (i.id === "shopify") config.storeUrl = v.primary.toLowerCase();
      if (i.id === "webill365") config.companyId = v.primary;
      if (i.id === "telegram") {
        config.botTokenLast4 = v.primary.slice(-4);
        config.chatId = v.secondary;
      }
      await integrationService.update(i.id, { status: "connected", connectedAt: at, errorMessage: undefined, config });
      await integrationService.addRun(i.id, { id: uid("sync"), startedAt: at, finishedAt: at, status: "success", recordsProcessed: 0, message: reconnect ? "Reconnected (simulated authorization)" : "Connected (simulated authorization)" });
    },
    { success: `${i.name} ${reconnect ? "reconnected" : "connected"} (simulated)`, onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !authorize.pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit((v) => authorize.fire(v))} noValidate>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <DemoNotice>Simulated connection: credentials are checked for format only and never leave your browser. Only the last 4 characters of secrets are kept.</DemoNotice>
            <Field label={copy.primary.label} htmlFor="cn-primary" required error={formState.errors.primary?.message} helper={copy.primary.helper}>
              <Input id="cn-primary" type={copy.primary.type ?? "text"} autoComplete="off" autoFocus placeholder={copy.primary.placeholder} {...register("primary")} aria-invalid={!!formState.errors.primary} aria-describedby={fieldDescribedBy("cn-primary", !!formState.errors.primary)} />
            </Field>
            <Field label={copy.secondary.label} htmlFor="cn-secondary" required error={formState.errors.secondary?.message} helper={copy.secondary.helper}>
              <Input id="cn-secondary" type={copy.secondary.type ?? "text"} autoComplete="off" placeholder={copy.secondary.placeholder} {...register("secondary")} aria-invalid={!!formState.errors.secondary} aria-describedby={fieldDescribedBy("cn-secondary", !!formState.errors.secondary)} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={authorize.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={authorize.pending}>
              {authorize.pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Authorize (simulated)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
