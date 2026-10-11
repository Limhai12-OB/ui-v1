"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { KeyRound, Loader2 } from "lucide-react";
import type { Integration } from "@/types";
import { integrationService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, fieldDescribedBy } from "@/components/forms/field";
import { BranchSelect } from "@/components/forms/entity-selects";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { SCHEDULE_LABEL, maskToken } from "./integration-meta";
import { SHOPIFY_URL, TELEGRAM_CHAT, TELEGRAM_TOKEN } from "./connect-dialog";

/* ------------------------------------------------------------------ */

function ToggleField<T extends FieldValues>({ control, name, label, description, disabled }: { control: Control<T>; name: Path<T>; label: string; description: string; disabled?: boolean }) {
  const id = `cfg-${String(name)}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
          <div className="space-y-0.5">
            <Label htmlFor={id} className="text-sm font-medium">
              {label}
            </Label>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
        </div>
      )}
    />
  );
}

function FormShell({ title, description, children, dirty, pending, onDiscard, saved }: { title: string; description: string; children: React.ReactNode; dirty: boolean; pending: boolean; onDiscard: () => void; saved: boolean }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
        <p className="mr-auto text-xs text-muted-foreground" role="status">
          {dirty ? "Unsaved changes" : saved ? "Configuration saved" : ""}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onDiscard} disabled={!dirty || pending}>
          Discard
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save configuration
        </Button>
      </div>
      <UnsavedChangesGuard when={dirty && !pending} />
    </Card>
  );
}

function useSave(i: Integration) {
  const [saved, setSaved] = useState(false);
  const action = useAction((config: Integration["config"]) => integrationService.update(i.id, { config }), { success: `${i.name} configuration saved`, onSuccess: () => setSaved(true) });
  return { saved, setSaved, action };
}

/* ------------------------------------------------------------------ */

const shopifySchema = z.object({
  storeUrl: z.string().trim().toLowerCase().regex(SHOPIFY_URL, "Enter an address like yourstore.myshopify.com"),
  branchId: z.string().min(1, "Choose the branch that receives online sales"),
  syncOrders: z.boolean(),
  syncInventory: z.boolean(),
  schedule: z.enum(["hourly", "every_6_hours", "daily", "manual"]),
});
type ShopifyValues = z.infer<typeof shopifySchema>;

function ShopifyForm({ i }: { i: Integration }) {
  const c = i.config;
  const values = (): ShopifyValues => ({
    storeUrl: String(c.storeUrl ?? ""),
    branchId: String(c.branchId ?? ""),
    syncOrders: c.syncOrders !== false,
    syncInventory: c.syncInventory !== false,
    schedule: (String(c.schedule ?? "every_6_hours") as ShopifyValues["schedule"]),
  });
  const form = useForm<ShopifyValues>({ resolver: zodResolver(shopifySchema), defaultValues: values(), mode: "onTouched" });
  const { register, control, handleSubmit, reset, formState } = form;
  const { saved, setSaved, action } = useSave(i);
  useEffect(() => void (formState.isDirty && setSaved(false)), [formState.isDirty, setSaved]);

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (v) => {
        try {
          await action.run({ ...c, ...v });
          reset(v);
        } catch {
          /* toasted */
        }
      })}
    >
      <FormShell title="Configuration" description="Choose where online orders are posted and what stays in sync." dirty={formState.isDirty} pending={action.pending} onDiscard={() => reset(values())} saved={saved}>
        <Field label="Store URL" htmlFor="cfg-storeUrl" required error={formState.errors.storeUrl?.message} helper="Your .myshopify.com address">
          <Input id="cfg-storeUrl" {...register("storeUrl")} aria-invalid={!!formState.errors.storeUrl} aria-describedby={fieldDescribedBy("cfg-storeUrl", !!formState.errors.storeUrl)} />
        </Field>
        <Field label="Post sales to branch" htmlFor="cfg-branch" required error={formState.errors.branchId?.message} helper="Orders are recorded as Shopify sales in this branch">
          <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="cfg-branch" value={field.value} onChange={field.onChange} aria-invalid={!!formState.errors.branchId} />} />
        </Field>
        <ToggleField control={control} name="syncOrders" label="Sync orders" description="Import paid online orders as sales and income transactions." />
        <ToggleField control={control} name="syncInventory" label="Sync inventory" description="Push LedgerVision stock levels for the selected branch to Shopify." />
        <Field label="Sync schedule" htmlFor="cfg-schedule">
          <Controller
            control={control}
            name="schedule"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="cfg-schedule" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SCHEDULE_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </FormShell>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const webillSchema = z.object({
  companyId: z.string().trim().regex(/^([A-Za-z0-9-]{4,24})?$/, "Enter a 4–24 character company ID"),
  autoSendInvoices: z.boolean(),
});
type WebillValues = z.infer<typeof webillSchema>;

function WebillForm({ i }: { i: Integration }) {
  const c = i.config;
  const values = (): WebillValues => ({ companyId: String(c.companyId ?? ""), autoSendInvoices: !!c.autoSendInvoices });
  const form = useForm<WebillValues>({ resolver: zodResolver(webillSchema), defaultValues: values(), mode: "onTouched" });
  const { register, control, handleSubmit, reset, formState } = form;
  const { saved, setSaved, action } = useSave(i);
  useEffect(() => void (formState.isDirty && setSaved(false)), [formState.isDirty, setSaved]);
  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (v) => {
        try {
          await action.run({ ...c, ...v });
          reset(v);
        } catch {
          /* toasted */
        }
      })}
    >
      <FormShell title="Configuration" description="Company details and e-invoice delivery." dirty={formState.isDirty} pending={action.pending} onDiscard={() => reset(values())} saved={saved}>
        <Field label="Company ID" htmlFor="cfg-companyId" error={formState.errors.companyId?.message} helper="Shown in WeBill365 under Company profile">
          <Input id="cfg-companyId" placeholder="e.g. KH-1029384" {...register("companyId")} aria-invalid={!!formState.errors.companyId} aria-describedby={fieldDescribedBy("cfg-companyId", !!formState.errors.companyId)} />
        </Field>
        <ToggleField control={control} name="autoSendInvoices" label="Auto-send invoices" description="Send each invoice through WeBill365 as soon as it is marked as sent." />
      </FormShell>
    </form>
  );
}

/* ------------------------------------------------------------------ */

const telegramSchema = z.object({
  botToken: z.string().trim().regex(new RegExp(`^(${TELEGRAM_TOKEN.source.slice(1, -1)})?$`), "Enter a token like 123456789:AAH… or leave empty to keep the current one"),
  chatId: z.string().trim().regex(TELEGRAM_CHAT, "Enter a numeric chat ID, e.g. -1001234567890"),
  dailySummary: z.boolean(),
  invoiceReminders: z.boolean(),
});
type TelegramValues = z.infer<typeof telegramSchema>;

function TelegramForm({ i }: { i: Integration }) {
  const c = i.config;
  const values = (): TelegramValues => ({ botToken: "", chatId: String(c.chatId ?? ""), dailySummary: !!c.dailySummary, invoiceReminders: !!c.invoiceReminders });
  const form = useForm<TelegramValues>({ resolver: zodResolver(telegramSchema), defaultValues: values(), mode: "onTouched" });
  const { register, control, handleSubmit, reset, formState } = form;
  const { saved, setSaved, action } = useSave(i);
  useEffect(() => void (formState.isDirty && setSaved(false)), [formState.isDirty, setSaved]);
  const hasToken = i.status !== "disconnected";
  return (
    <form
      noValidate
      onSubmit={handleSubmit(async ({ botToken, ...v }) => {
        try {
          await action.run({ ...c, ...v, ...(botToken ? { botTokenLast4: botToken.slice(-4) } : {}) });
          reset({ ...v, botToken: "" });
        } catch {
          /* toasted */
        }
      })}
    >
      <FormShell title="Configuration" description="Bot credentials and what the bot sends." dirty={formState.isDirty} pending={action.pending} onDiscard={() => reset(values())} saved={saved}>
        <Field
          label="Bot token"
          htmlFor="cfg-botToken"
          error={formState.errors.botToken?.message}
          helper={
            <span className="inline-flex items-center gap-1">
              <KeyRound className="size-3" aria-hidden />
              {hasToken ? <>Current: <span className="font-mono">{maskToken(c.botTokenLast4 as string | undefined)}</span> — leave empty to keep it</> : "No token saved"}
            </span>
          }
        >
          <Input id="cfg-botToken" type="password" autoComplete="off" placeholder="Paste a new token to replace" {...register("botToken")} aria-invalid={!!formState.errors.botToken} aria-describedby={fieldDescribedBy("cfg-botToken", !!formState.errors.botToken)} />
        </Field>
        <Field label="Chat ID" htmlFor="cfg-chatId" required error={formState.errors.chatId?.message} helper="Group or channel that receives messages">
          <Input id="cfg-chatId" inputMode="numeric" {...register("chatId")} aria-invalid={!!formState.errors.chatId} aria-describedby={fieldDescribedBy("cfg-chatId", !!formState.errors.chatId)} />
        </Field>
        <ToggleField control={control} name="dailySummary" label="Daily summary" description="Revenue, expenses and cash position every morning at 07:00." />
        <ToggleField control={control} name="invoiceReminders" label="Invoice reminders" description="Remind customers with a Telegram handle before and after the due date." />
      </FormShell>
    </form>
  );
}

export function IntegrationConfigForm({ integration }: { integration: Integration }) {
  if (integration.id === "shopify") return <ShopifyForm i={integration} />;
  if (integration.id === "webill365") return <WebillForm i={integration} />;
  return <TelegramForm i={integration} />;
}
