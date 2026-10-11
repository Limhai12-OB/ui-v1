"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import type { NotificationPreferences } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { notificationService } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormSection } from "@/components/forms/field";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type EventKey = keyof NotificationPreferences["events"];

const EVENTS: { key: EventKey; label: string; description: string }[] = [
  { key: "overdue_invoices", label: "Overdue invoices", description: "When a customer invoice passes its due date" },
  { key: "upcoming_bills", label: "Upcoming bills", description: "Bills due within 14 days and overdue bills" },
  { key: "low_stock", label: "Low stock", description: "Items at or below their reorder level in a branch" },
  { key: "import_review", label: "Imports needing review", description: "Imported transactions waiting for category confirmation" },
  { key: "reconciliation", label: "Reconciliation", description: "Submitted, signed-off and returned reconciliations" },
  { key: "till", label: "Till counts", description: "Till counts submitted for sign-off or returned" },
  { key: "reports", label: "Monthly reports", description: "When a monthly report is generated or incomplete" },
  { key: "system", label: "System & integrations", description: "Sync results, connection errors and invitations" },
];

const DIGEST: { value: NotificationPreferences["digest"]; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "Only individual notifications" },
  { value: "daily", label: "Daily", description: "A summary every morning at 07:00" },
  { value: "weekly", label: "Weekly", description: "A summary every Monday at 07:00" },
];

function SwitchRow({ id, label, description, children }: { id: string; label: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 sm:col-span-2">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  );
}

export function NotificationPreferencesPage() {
  const prefs = useAppStore((s) => s.notificationPreferences);
  const telegram = useAppStore((s) => s.integrations.find((i) => i.id === "telegram"));
  const { isOwner } = useScope();
  const telegramReady = telegram?.status === "connected" || telegram?.status === "syncing";
  const [saved, setSaved] = useState(false);

  const form = useForm<NotificationPreferences>({ defaultValues: prefs });
  const { control, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (formState.isDirty) setSaved(false);
  }, [formState.isDirty]);

  const save = useAction((p: NotificationPreferences) => notificationService.updatePreferences(p), {
    success: "Notification preferences saved",
    onSuccess: () => setSaved(true),
  });

  const onSubmit = handleSubmit(async (v) => {
    const value: NotificationPreferences = { ...v, channels: { ...v.channels, telegram: telegramReady ? v.channels.telegram : false } };
    try {
      await save.run(value);
      reset(value);
    } catch {
      /* error already toasted; keep the form dirty */
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader title="Notification preferences" description="Choose how and when LedgerVision tells you about activity in your business." backHref="/notifications" backLabel="Notifications" />
      <Card className="gap-0 px-6 py-0">
        <FormSection title="Channels" description="Where notifications are delivered.">
          <Controller
            control={control}
            name="channels.inApp"
            render={({ field }) => (
              <SwitchRow id="ch-inapp" label="In-app" description="Bell menu and the Notifications page. Critical alerts always appear here.">
                <Switch id="ch-inapp" checked={field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
          <Controller
            control={control}
            name="channels.email"
            render={({ field }) => (
              <SwitchRow id="ch-email" label="Email" description="Sent to your account email address.">
                <Switch id="ch-email" checked={field.value} onCheckedChange={field.onChange} />
              </SwitchRow>
            )}
          />
          <Controller
            control={control}
            name="channels.telegram"
            render={({ field }) => (
              <SwitchRow
                id="ch-telegram"
                label="Telegram"
                description={
                  telegramReady ? (
                    "Delivered by your connected Telegram bot."
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      Requires the Telegram integration
                      {telegram && <StatusBadge status={telegram.status} />}
                      {isOwner ? (
                        <Link href="/integrations/telegram" className="font-medium text-primary underline-offset-4 hover:underline">
                          {telegram?.status === "error" ? "Reconnect Telegram" : "Connect Telegram"}
                        </Link>
                      ) : (
                        <span>— ask the business owner to connect it.</span>
                      )}
                    </span>
                  )
                }
              >
                <Switch id="ch-telegram" checked={telegramReady && field.value} onCheckedChange={field.onChange} disabled={!telegramReady} />
              </SwitchRow>
            )}
          />
        </FormSection>

        <FormSection title="Events" description="Which activity creates a notification.">
          {EVENTS.map((e) => (
            <Controller
              key={e.key}
              control={control}
              name={`events.${e.key}`}
              render={({ field }) => (
                <SwitchRow id={`ev-${e.key}`} label={e.label} description={e.description}>
                  <Switch id={`ev-${e.key}`} checked={field.value} onCheckedChange={field.onChange} />
                </SwitchRow>
              )}
            />
          ))}
        </FormSection>

        <FormSection title="Digest" description="A summary of unread notifications.">
          <Controller
            control={control}
            name="digest"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2 sm:col-span-2" aria-label="Digest frequency">
                {DIGEST.map((d) => (
                  <Label key={d.value} htmlFor={`dg-${d.value}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-light/40">
                    <RadioGroupItem id={`dg-${d.value}`} value={d.value} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{d.label}</span>
                      <span className="block text-xs text-muted-foreground">{d.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
        </FormSection>
      </Card>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <p className="mr-auto text-xs text-muted-foreground" role="status">
          {formState.isDirty ? "You have unsaved changes" : saved ? "All changes saved" : ""}
        </p>
        <Button type="button" variant="outline" onClick={() => reset(prefs)} disabled={!formState.isDirty || save.pending}>
          Discard
        </Button>
        <Button type="submit" disabled={!formState.isDirty || save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          Save preferences
        </Button>
      </div>
      <UnsavedChangesGuard when={formState.isDirty && !save.pending} />
    </form>
  );
}
