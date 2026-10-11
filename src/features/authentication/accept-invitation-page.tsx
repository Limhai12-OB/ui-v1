"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ban, Building2, CheckCircle2, Clock, Link2Off, Loader2, MailOpen, Store, UserCheck } from "lucide-react";
import { managerService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAction } from "@/hooks/use-action";
import { addDaysISO, daysBetween, formatDate, today } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthIcon, AuthNarrow, AuthSkeleton, PasswordInput, PasswordStrength, newPasswordSchema } from "./auth-ui";

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string().min(1, "Confirm your password") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type FormValues = z.infer<typeof schema>;

export const INVITE_VALID_DAYS = 7;

/** Days until an invitation expires (negative when expired), on the demo clock. */
export function inviteDaysLeft(invitedAt: string): number {
  return daysBetween(today(), addDaysISO(invitedAt.slice(0, 10), INVITE_VALID_DAYS));
}

function StateScreen({ icon, tone, title, description, children }: { icon: React.ReactNode; tone?: "primary" | "warning" | "error" | "info"; title: string; description: React.ReactNode; children?: React.ReactNode }) {
  return (
    <AuthNarrow>
      <AuthHeader icon={<AuthIcon tone={tone}>{icon}</AuthIcon>} title={title} description={description} />
      {children}
    </AuthNarrow>
  );
}

export function AcceptInvitationPage() {
  const hydrated = useHydrated();
  const inviteId = useSearchParams().get("invite");
  const manager = useAppStore((s) => s.managers.find((m) => m.id === inviteId));
  const branch = useAppStore((s) => s.branches.find((b) => b.id === manager?.branchId));
  const business = useAppStore((s) => s.business);
  const [accepted, setAccepted] = useState(false);

  const { register, handleSubmit, control, formState } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { password: "", confirm: "" } });
  const { errors, isValid } = formState;
  const password = useWatch({ control, name: "password" });
  const accept = useAction(() => managerService.accept(inviteId!), { success: "Invitation accepted", onSuccess: () => setAccepted(true) });

  if (!hydrated) return <AuthSkeleton fields={2} />;

  if (accepted && manager) {
    return (
      <StateScreen
        icon={<CheckCircle2 />}
        title={`You're in, ${manager.name.split(" ")[0]}`}
        description={
          <>
            Your branch manager account for <span className="font-medium text-foreground">{branch?.name}</span> at {business.name} is active.
          </>
        }
      >
        <div role="status" className="space-y-4">
          <ol className="space-y-3 rounded-lg border p-4 text-sm">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary">1</span>
              <span>
                Sign in with <span className="font-medium">{manager.email}</span> and the password you just set.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary">2</span>
              <span>If your owner gave you a temporary password instead, you’ll be asked to change it on first sign-in.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary">3</span>
              <span>You’ll see only {branch?.name ?? "your branch"}: its accounts, sales, stock, tills and reconciliations.</span>
            </li>
          </ol>
          <DemoNotice>
            In the demo, {manager.name} isn’t a sign-in account. To explore the branch manager experience, sign in as the demo manager <span className="font-medium">Dara Kim</span> (dara.kim@angkorfresh.demo) from the sign-in page.
          </DemoNotice>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href="/sign-in">Go to sign in</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/change-password">Change a temporary password</Link>
            </Button>
          </div>
        </div>
      </StateScreen>
    );
  }

  if (!inviteId) {
    return (
      <StateScreen icon={<Link2Off />} tone="error" title="Invitation link is incomplete" description="This link is missing its invitation code. Open the full link from your invitation email, or ask your Business Owner to resend it.">
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </StateScreen>
    );
  }

  if (!manager || !branch) {
    return (
      <StateScreen icon={<Link2Off />} tone="error" title="Invitation not found" description="This invitation doesn't exist or was revoked by the Business Owner. Ask them to send you a new invitation.">
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </StateScreen>
    );
  }

  if (manager.status === "active") {
    return (
      <StateScreen icon={<UserCheck />} tone="info" title="Invitation already accepted" description={<>The account for <span className="font-medium text-foreground">{manager.email}</span> is already active. Sign in to continue.</>}>
        <Button asChild className="w-full">
          <Link href="/sign-in">Go to sign in</Link>
        </Button>
      </StateScreen>
    );
  }

  if (manager.status === "suspended") {
    return (
      <StateScreen icon={<Ban />} tone="error" title="This invitation is no longer valid" description="Access for this branch manager has been suspended. Contact your Business Owner if you think this is a mistake." />
    );
  }

  const daysLeft = inviteDaysLeft(manager.invitedAt);
  if (daysLeft < 0) {
    return (
      <StateScreen icon={<Clock />} tone="warning" title="This invitation has expired" description={`Invitations are valid for ${INVITE_VALID_DAYS} days. Ask your Business Owner to resend the invitation.`} />
    );
  }

  return (
    <AuthNarrow>
      <AuthHeader icon={<AuthIcon><MailOpen /></AuthIcon>} title="Join your team on LedgerVision" description={`${business.name} invited you to manage a branch. Set a password to accept.`} />

      <div className="mb-5 grid gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Business</span>
          <span className="ml-auto text-right font-medium">{business.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Store className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Branch</span>
          <span className="ml-auto text-right font-medium">{branch.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Expires</span>
          <span className="ml-auto text-right font-medium tabular-nums">
            {formatDate(addDaysISO(manager.invitedAt.slice(0, 10), INVITE_VALID_DAYS))} ({daysLeft === 0 ? "today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`})
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit(() => accept.fire())} noValidate className="space-y-4">
        <Field label="Name" htmlFor="inv-name">
          <Input id="inv-name" value={manager.name} readOnly disabled />
        </Field>
        <Field label="Email" htmlFor="inv-email" helper="Invitations are tied to this email address.">
          <Input id="inv-email" value={manager.email} readOnly disabled />
        </Field>
        <Field label="Create password" htmlFor="inv-password" required error={errors.password?.message}>
          <PasswordInput id="inv-password" autoComplete="new-password" autoFocus {...register("password")} aria-invalid={!!errors.password} aria-describedby="inv-strength" />
        </Field>
        <PasswordStrength id="inv-strength" value={password ?? ""} />
        <Field label="Confirm password" htmlFor="inv-confirm" required error={errors.confirm?.message}>
          <PasswordInput id="inv-confirm" autoComplete="new-password" {...register("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={!isValid || accept.pending}>
          {accept.pending && <Loader2 className="animate-spin" />}
          {accept.pending ? "Accepting…" : "Accept invitation"}
        </Button>
        <p className="text-xs text-muted-foreground">As a branch manager you’ll work only in {branch.name}. The Business Owner manages branches, invitations and business settings.</p>
      </form>
    </AuthNarrow>
  );
}
