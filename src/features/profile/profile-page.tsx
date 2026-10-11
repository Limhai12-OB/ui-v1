"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bell, Building2, ChevronRight, KeyRound, Loader2, Lock, ShieldCheck, Store } from "lucide-react";
import { userService } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useCurrentUser } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatDateTime } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { DetailList } from "@/components/shared/detail-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { GoogleMark } from "@/features/authentication/auth-ui";
import { LinkAccountStep } from "@/features/authentication/google-sign-in-dialog";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80, "Keep it under 80 characters"),
  phone: z
    .string()
    .trim()
    .max(24, "Phone number is too long")
    .refine((v) => v === "" || /^\+?[\d\s()-]{6,}$/.test(v), "Use digits, spaces and an optional leading +"),
});
type FormValues = z.infer<typeof schema>;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfilePage() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader title="Profile" description="Your personal details and how you sign in to LedgerVision." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-6">
          <PersonalInfoCard key={user.id} />
          <SignInMethodsCard />
        </div>
        <div className="grid content-start gap-6">
          <RoleCard />
          <Card className="gap-0 py-0">
            <Link href="/notifications/preferences" className="flex items-center gap-3 rounded-xl px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-light text-primary">
                <Bell className="size-4" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium">Notification preferences</span>
                <span className="block text-xs text-muted-foreground">Choose which alerts you receive and how.</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

function PersonalInfoCard() {
  const user = useCurrentUser();
  const toValues = (): FormValues => ({ name: user.name, phone: user.phone ?? "" });
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: toValues() });
  const { errors, isDirty, isValid } = formState;

  useEffect(() => {
    if (!formState.isDirty) reset(toValues());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.name, user.phone]);

  const save = useAction(
    async (v: FormValues): Promise<void> => {
      await userService.update(user.id, { name: v.name.trim(), phone: v.phone.trim() || undefined, avatarInitials: initials(v.name) || user.avatarInitials });
    },
    { success: "Profile updated", onSuccess: () => reset(undefined, { keepValues: true }) },
  );

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty && !save.pending} />
      <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-light text-base font-semibold text-primary" aria-hidden>
              {user.avatarInitials}
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{user.name}</CardTitle>
              <CardDescription className="truncate">{user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="pf-name" required error={errors.name?.message}>
            <Input id="pf-name" autoComplete="name" {...register("name")} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Phone" htmlFor="pf-phone" error={errors.phone?.message} helper="Optional. Shown to your team.">
            <Input id="pf-phone" type="tel" autoComplete="tel" placeholder="+855 12 000 000" {...register("phone")} aria-invalid={!!errors.phone} />
          </Field>
          <Field label="Email" htmlFor="pf-email" className="sm:col-span-2" helper="Changing your sign-in email requires verification by the authentication service and isn’t available in the demo.">
            <Input id="pf-email" value={user.email} readOnly disabled />
          </Field>
        </CardContent>
        <CardFooter className="mt-6 justify-end gap-2 border-t">
          <Button type="button" variant="outline" disabled={!isDirty || save.pending} onClick={() => reset(toValues())}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || !isValid || save.pending}>
            {save.pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function SignInMethodsCard() {
  const user = useCurrentUser();
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const hasPassword = user.authProvider !== "google";
  const hasGoogle = user.authProvider !== "password";
  const unlink = useAction(() => userService.update(user.id, { authProvider: "password" }), { success: "Google sign-in unlinked" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign-in methods</CardTitle>
        <CardDescription>Ways you can sign in to {user.email}.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y rounded-lg border p-0 mx-6">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <KeyRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Password</p>
            <p className="text-xs text-muted-foreground">{hasPassword ? "Set" : "Not set — you sign in with Google only"}</p>
          </div>
          {hasPassword && (
            <Button asChild variant="outline" size="sm">
              <Link href="/change-password">Change password</Link>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <GoogleMark />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              Google
              {hasGoogle ? (
                <Badge variant="success">
                  <ShieldCheck /> Linked
                </Badge>
              ) : (
                <Badge variant="neutral">Not linked</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{hasGoogle ? "Sign in with your Google account for this email." : "Link Google after confirming your password or an email code."}</p>
          </div>
          {hasGoogle ? (
            hasPassword && (
              <Button variant="ghost" size="sm" onClick={() => setUnlinkOpen(true)}>
                Unlink
              </Button>
            )
          ) : (
            <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
              Link Google
            </Button>
          )}
        </div>
      </CardContent>
      <p className="px-6 text-xs text-muted-foreground">Simulated in the demo — no Google account is contacted.</p>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">{linkOpen && <LinkAccountStep user={user} backLabel="Cancel" onBack={() => setLinkOpen(false)} onLinked={() => setLinkOpen(false)} />}</DialogContent>
      </Dialog>
      <ConfirmDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        title="Unlink Google sign-in?"
        description="You’ll sign in with your email and password only. You can link Google again at any time."
        confirmLabel="Unlink Google"
        destructive
        onConfirm={() => unlink.run()}
      />
    </Card>
  );
}

function RoleCard() {
  const user = useCurrentUser();
  const branch = useAppStore((s) => s.branches.find((b) => b.id === user.branchId));
  const manager = useAppStore((s) => s.managers.find((m) => m.email.toLowerCase() === user.email.toLowerCase()));
  const businessName = useAppStore((s) => s.business.name);
  const isOwner = user.role === "owner";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Role &amp; access
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Managed by owner
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DetailList
          columns={1}
          items={[
            { label: "Business", value: <span className="flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" aria-hidden />{businessName}</span> },
            { label: "Role", value: isOwner ? "Business Owner" : "Branch Manager" },
            {
              label: "Assigned branch",
              value: isOwner ? "All branches" : branch ? <span className="flex items-center gap-1.5"><Store className="size-3.5 text-muted-foreground" aria-hidden />{branch.name}</span> : "—",
            },
            ...(manager ? [{ label: "Account status", value: <StatusBadge status={manager.status} /> }, { label: "Joined", value: formatDate(manager.joinedAt) }, { label: "Last active", value: formatDateTime(manager.lastActiveAt) }] : [{ label: "Member since", value: formatDate(user.createdAt) }]),
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {isOwner
            ? "As Business Owner you can see every branch, manage branches and managers, and sign off reconciliations and tills."
            : "You can work with records for your assigned branch only. Ask the Business Owner to change your branch or permissions."}
        </p>
      </CardContent>
    </Card>
  );
}
