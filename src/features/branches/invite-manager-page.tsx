"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Copy, ExternalLink, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import type { BranchManager } from "@/types";
import { managerService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useAction } from "@/hooks/use-action";
import { PageHeader } from "@/components/shared/page-header";
import { DemoNotice } from "@/components/shared/demo-notice";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FormSection } from "@/components/forms/field";
import { copyInvitationLink, invitationLink } from "./managers-page";

export function InviteManagerPage() {
  const preselect = useSearchParams().get("branch") ?? "";
  const [invited, setInvited] = useState<BranchManager | null>(null);
  const [round, setRound] = useState(0);
  if (invited) return <InviteSuccess manager={invited} onAnother={() => { setInvited(null); setRound((r) => r + 1); }} />;
  return <InviteForm key={round} preselect={round === 0 ? preselect : ""} onInvited={setInvited} />;
}

function InviteForm({ preselect, onInvited }: { preselect: string; onInvited: (m: BranchManager) => void }) {
  const branches = useAppStore((s) => s.branches);
  const managers = useAppStore((s) => s.managers);
  const [done, setDone] = useState(false);
  const available = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return !!b && b.status === "active" && !managers.some((m) => m.branchId === id);
  };
  const emails = managers.map((m) => m.email.toLowerCase());

  const schema = z.object({
    name: z.string().trim().min(2, "Enter the manager’s full name").max(80),
    email: z
      .string()
      .trim()
      .min(1, "Enter an email address")
      .email("Enter a valid email address")
      .refine((v) => !emails.includes(v.toLowerCase()), "This email already belongs to a branch manager"),
    phone: z
      .string()
      .trim()
      .min(6, "Enter a phone number")
      .max(24, "Phone number is too long")
      .regex(/^\+?[\d\s()-]+$/, "Use digits, spaces and an optional leading +"),
    branchId: z.string().min(1, "Choose a branch").refine(available, "This branch already has a manager"),
  });
  type FormValues = z.infer<typeof schema>;

  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", branchId: available(preselect) ? preselect : "" },
  });
  const { errors, isDirty } = formState;
  const invite = useAction((v: FormValues) => managerService.invite({ name: v.name.trim(), email: v.email.trim().toLowerCase(), phone: v.phone.trim(), branchId: v.branchId }), {
    success: "Invitation created",
    onSuccess: (m) => {
      setDone(true);
      onInvited(m);
    },
  });

  const openBranches = branches.filter((b) => available(b.id));

  return (
    <>
      <UnsavedChangesGuard when={isDirty && !done} />
      <PageHeader backHref="/branch-managers" backLabel="Branch managers" title="Invite a branch manager" description="They’ll set their own password from the invitation link and see only the branch you choose." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0 py-0">
          <form onSubmit={handleSubmit((v) => invite.fire(v))} noValidate>
            <div className="px-6">
              <FormSection title="Manager" description="Who you’re inviting.">
                <Field label="Full name" htmlFor="inv-name" required error={errors.name?.message} className="sm:col-span-2">
                  <Input id="inv-name" autoFocus {...register("name")} aria-invalid={!!errors.name} />
                </Field>
                <Field label="Email" htmlFor="inv-email" required error={errors.email?.message} helper="The invitation is tied to this address.">
                  <Input id="inv-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
                </Field>
                <Field label="Phone" htmlFor="inv-phone" required error={errors.phone?.message}>
                  <Input id="inv-phone" type="tel" placeholder="+855 12 000 000" {...register("phone")} aria-invalid={!!errors.phone} />
                </Field>
              </FormSection>
              <FormSection title="Branch" description="A manager is assigned to exactly one branch.">
                <Field label="Branch" htmlFor="inv-branch" required error={errors.branchId?.message} className="sm:col-span-2" helper={openBranches.length === 0 ? "Every active branch already has a manager. Reassign or revoke one first, or add a new branch." : undefined}>
                  <Controller
                    control={control}
                    name="branchId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="inv-branch" className="w-full" aria-invalid={!!errors.branchId}>
                          <SelectValue placeholder="Select a branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => {
                            const holder = managers.find((m) => m.branchId === b.id);
                            return (
                              <SelectItem key={b.id} value={b.id} disabled={!available(b.id)}>
                                {b.name}
                                {holder ? ` — ${holder.name} (${holder.status})` : b.status !== "active" ? " — inactive" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </FormSection>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/30 px-6 py-4">
              <Button asChild variant="outline">
                <Link href="/branch-managers">Cancel</Link>
              </Button>
              <Button type="submit" disabled={invite.pending || openBranches.length === 0}>
                {invite.pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Create invitation
              </Button>
            </div>
          </form>
        </Card>
        <Card className="h-fit gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-primary" aria-hidden /> What happens next
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>We create a one-time invitation link valid for 7 days.</li>
              <li>The manager opens it, confirms the branch and sets a password.</li>
              <li>They sign in and see only their branch. You can reassign or suspend them any time.</li>
            </ol>
            <DemoNotice className="mt-4">Simulated — no email is sent. You’ll get the link to copy and share yourself.</DemoNotice>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function InviteSuccess({ manager, onAnother }: { manager: BranchManager; onAnother: () => void }) {
  const branch = useAppStore((s) => s.branches.find((b) => b.id === manager.branchId));
  const link = invitationLink(manager.id);
  return (
    <>
      <PageHeader backHref="/branch-managers" backLabel="Branch managers" title="Invitation ready" />
      <Card className="max-w-2xl">
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3" role="status">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-light text-success-text">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-medium">
                {manager.name} was invited to manage {branch?.name}.
              </p>
              <p className="text-sm text-muted-foreground">Share this link with {manager.email}. It expires in 7 days.</p>
            </div>
          </div>
          <Field label="Invitation link" htmlFor="inv-link">
            <div className="flex gap-2">
              <Input id="inv-link" readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" onClick={() => copyInvitationLink(manager.id)}>
                <Copy /> Copy
              </Button>
            </div>
          </Field>
          <DemoNotice>Simulated — no email was sent. Open the link in this browser to see the invitee’s experience.</DemoNotice>
          <div className="flex flex-wrap gap-2 border-t pt-5">
            <Button asChild>
              <Link href="/branch-managers">Done</Link>
            </Button>
            <Button variant="outline" onClick={onAnother}>
              <UserPlus /> Invite another
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/accept-invitation?invite=${manager.id}`} target="_blank" rel="noopener">
                <ExternalLink /> Open invitation
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
