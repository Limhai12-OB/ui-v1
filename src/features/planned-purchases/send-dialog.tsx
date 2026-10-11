"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle } from "lucide-react";
import type { Customer } from "@/types";
import { addDaysISO, formatDate, today } from "@/lib/date";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { cn } from "@/lib/utils";

export type SendChannel = "telegram" | "email";

export function sendNote(channel: SendChannel, customer: Customer | undefined, extra?: string) {
  const to = channel === "telegram" ? (customer?.telegram ?? "Telegram") : (customer?.email ?? "email");
  return `Sent via ${channel === "telegram" ? "Telegram" : "email"} to ${to} (simulated — nothing was delivered)${extra ? ` · ${extra}` : ""}`;
}

interface SendDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer?: Customer;
  number?: string;
  /** Resend flow: ask for a new valid-until date first. */
  extendValidity?: boolean;
  currentValidUntil?: string;
  onConfirm: (channel: SendChannel, validUntil?: string) => Promise<unknown>;
  title?: string;
}

/** Choose how a planned purchase is shared. Delivery is simulated in the demo. */
export function SendDialog({ open, onOpenChange, customer, number, extendValidity, currentValidUntil, onConfirm, title }: SendDialogProps) {
  const hasTelegram = !!customer?.telegram;
  const hasEmail = !!customer?.email;
  const [channel, setChannel] = useState<SendChannel>("telegram");
  const [validUntil, setValidUntil] = useState(addDaysISO(today(), 14));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(hasTelegram || !hasEmail ? "telegram" : "email");
    setValidUntil(addDaysISO(today(), 14));
  }, [open, hasTelegram, hasEmail]);

  const dateError = extendValidity && (!validUntil ? "Choose a new valid-until date" : validUntil <= today() ? "Must be after today" : undefined);
  const channelUnavailable = (channel === "telegram" && !hasTelegram) || (channel === "email" && !hasEmail);

  const submit = async () => {
    if (dateError || channelUnavailable) return;
    setBusy(true);
    try {
      await onConfirm(channel, extendValidity ? validUntil : undefined);
      onOpenChange(false);
    } catch {
      /* toast shown by caller */
    } finally {
      setBusy(false);
    }
  };

  const options: { v: SendChannel; label: string; to?: string; icon: typeof Mail }[] = [
    { v: "telegram", label: "Telegram", to: customer?.telegram, icon: MessageCircle },
    { v: "email", label: "Email", to: customer?.email, icon: Mail },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? `Send ${number ?? "planned purchase"} to customer`}</DialogTitle>
          <DialogDescription>
            {extendValidity
              ? `The offer expired on ${formatDate(currentValidUntil)}. Set a new validity date and send it again.`
              : `${customer?.name ?? "The customer"} can accept or reject the estimate. Record their response here afterwards.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {extendValidity && (
            <Field label="New valid-until date" htmlFor="resend-valid" required error={dateError || undefined}>
              <Input id="resend-valid" type="date" min={addDaysISO(today(), 1)} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="tabular-nums" aria-invalid={!!dateError} />
            </Field>
          )}
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Send via</legend>
            <RadioGroup value={channel} onValueChange={(v) => setChannel(v as SendChannel)} className="grid gap-2">
              {options.map((o) => {
                const Icon = o.icon;
                return (
                  <Label
                    key={o.v}
                    htmlFor={`send-${o.v}`}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-light/40", !o.to && "cursor-not-allowed opacity-60")}
                  >
                    <RadioGroupItem id={`send-${o.v}`} value={o.v} disabled={!o.to} />
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{o.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.to ?? `No ${o.label.toLowerCase()} on file — add it to the customer`}</span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          </fieldset>
          {!hasTelegram && !hasEmail && <p role="alert" className="text-xs text-destructive">This customer has no Telegram handle or email. Edit the customer to add one.</p>}
          <DemoNotice>
            <span className="font-medium">Simulated delivery.</span> Nothing is sent in the demo — the send is only recorded in the planned purchase history.
          </DemoNotice>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || channelUnavailable || !!dateError}>
            {busy && <Loader2 className="animate-spin" />}
            {extendValidity ? "Extend & resend" : "Send (simulated)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
