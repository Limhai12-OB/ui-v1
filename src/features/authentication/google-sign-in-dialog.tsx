"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, KeyRound, Link2, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import type { User } from "@/types";
import { authService, userService, ApiError } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { useSessionStore } from "@/store/session-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { GoogleMark, OtpInput, PasswordInput, suspendedMessage, useCooldown } from "./auth-ui";

interface GoogleAccount {
  name: string;
  email: string;
  initials: string;
}

const NEW_GOOGLE_ACCOUNT: GoogleAccount = { name: "Lina Sok", email: "lina.sok.retail@gmail.com", initials: "LS" };

type Step = { kind: "choose" } | { kind: "link"; user: User; account: GoogleAccount } | { kind: "new"; account: GoogleAccount };

const hasGoogle = (u: User) => u.authProvider === "google" || u.authProvider === "password+google";

/**
 * Simulated "Sign in with Google". Real OAuth is handled by the backend.
 * If the Google email matches an existing password account, the accounts are
 * never merged automatically — the user must prove ownership first.
 */
export function GoogleSignInDialog({ open, onOpenChange, next }: { open: boolean; onOpenChange: (o: boolean) => void; next: string }) {
  const router = useRouter();
  const users = useAppStore((s) => s.users);
  const signIn = useSessionStore((s) => s.signIn);
  const startSignUp = useSessionStore((s) => s.startSignUp);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep({ kind: "choose" });
      setBusyEmail(null);
    }
  }, [open]);

  const accounts = useMemo<GoogleAccount[]>(
    () => [...users.map((u) => ({ name: u.name, email: u.email, initials: u.avatarInitials })), NEW_GOOGLE_ACCOUNT],
    [users],
  );

  const choose = async (account: GoogleAccount) => {
    setBusyEmail(account.email);
    try {
      // Simulated Google consent round-trip.
      await new Promise((r) => setTimeout(r, 700));
      const user = users.find((u) => u.email.toLowerCase() === account.email.toLowerCase());
      if (!user) return setStep({ kind: "new", account });
      if (!hasGoogle(user)) return setStep({ kind: "link", user, account });
      const suspended = suspendedMessage(user.email);
      if (suspended) {
        toast.error("Can't sign in", { description: suspended });
        return;
      }
      signIn(user.id, true);
      toast.success(`Signed in as ${user.name}`);
      onOpenChange(false);
      router.replace(next);
    } finally {
      setBusyEmail(null);
    }
  };

  const busy = busyEmail !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        {step.kind === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GoogleMark className="size-5" /> Choose a Google account
              </DialogTitle>
              <DialogDescription>to continue to LedgerVision</DialogDescription>
            </DialogHeader>
            <ul className="-mx-2 divide-y rounded-lg border" aria-label="Google accounts">
              {accounts.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => choose(a)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-semibold text-primary" aria-hidden>
                      {a.initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                    </span>
                    {busyEmail === a.email ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Connecting" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
            <DemoNotice>Simulated Google sign-in — no Google window opens and no data leaves your browser. Pick an account to see each path: already linked, existing password account, or new account.</DemoNotice>
          </>
        )}

        {step.kind === "link" && (
          <LinkAccountStep
            user={step.user}
            onBack={() => setStep({ kind: "choose" })}
            onLinked={() => {
              signIn(step.user.id, true);
              onOpenChange(false);
              router.replace(next);
            }}
          />
        )}

        {step.kind === "new" && (
          <>
            <DialogHeader>
              <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary-light text-primary" aria-hidden>
                <UserPlus className="size-5" />
              </span>
              <DialogTitle>No LedgerVision account yet</DialogTitle>
              <DialogDescription>
                There’s no account for <span className="font-medium text-foreground">{step.account.email}</span>. You can create a Business Owner account with this Google account.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Google has already verified this email (simulated), so no verification code is needed.
              </li>
              <li className="flex gap-2">
                <Mail className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                Branch managers don’t sign up here — they join from the invitation their Business Owner sends.
              </li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep({ kind: "choose" })}>
                <ArrowLeft /> Back
              </Button>
              <Button
                onClick={() => {
                  startSignUp(step.account.name, step.account.email);
                  onOpenChange(false);
                  router.push("/business-setup");
                }}
              >
                Create business account
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Verified account linking: password or emailed code (simulated) before Google is linked. */
export function LinkAccountStep({ user, onBack, onLinked, backLabel = "Back" }: { user: User; onBack: () => void; onLinked: () => void; backLabel?: string }) {
  const [method, setMethod] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useCooldown(30, false);

  const canSubmit = method === "password" ? password.length > 0 : codeSent && code.length === 6;

  const sendCode = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    setCodeSent(true);
    cooldown.restart();
  };

  const verify = async () => {
    setError(null);
    setPending(true);
    try {
      if (method === "password") await authService.signIn(user.email, password);
      else await authService.verifyEmail(code);
      const suspended = suspendedMessage(user.email);
      if (suspended) throw new Error(suspended);
      await userService.update(user.id, { authProvider: "password+google" });
      toast.success("Google sign-in linked", { description: `You can now sign in to ${user.email} with Google or your password.` });
      onLinked();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Verification failed. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !pending) verify();
      }}
      noValidate
      className="grid gap-4"
    >
      <DialogHeader>
        <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-warning-light text-warning-text" aria-hidden>
          <Link2 className="size-5" />
        </span>
        <DialogTitle>Confirm it’s you to link Google</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{user.email}</span> already has a LedgerVision account that uses a password. To protect your financial data we never merge accounts automatically — anyone could create a Google account with a matching address. Verify you own this account to link Google sign-in.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={method} onValueChange={(v) => { setMethod(v as typeof method); setError(null); }}>
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            <KeyRound /> Password
          </TabsTrigger>
          <TabsTrigger value="code" className="flex-1">
            <Mail /> Email code
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password" className="pt-3">
          <Field label="Current LedgerVision password" htmlFor="link-password" error={method === "password" ? (error ?? undefined) : undefined}>
            <PasswordInput id="link-password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
          </Field>
        </TabsContent>
        <TabsContent value="code" className="space-y-3 pt-3">
          {!codeSent ? (
            <Button type="button" variant="outline" className="w-full" onClick={sendCode} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Mail />} Send a code to {user.email}
            </Button>
          ) : (
            <>
              <Field label="6-digit code" htmlFor="link-otp" error={method === "code" ? (error ?? undefined) : undefined}>
                <OtpInput idPrefix="link-otp" value={code} onChange={setCode} invalid={!!error} autoFocus />
              </Field>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Code “sent” to {user.email}</span>
                <Button type="button" variant="link" size="xs" className="h-auto p-0" disabled={cooldown.left > 0 || sending} onClick={sendCode}>
                  {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend code"}
                </Button>
              </div>
            </>
          )}
          <DemoNotice>No email is sent in the demo — enter any 6 digits.</DemoNotice>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          <ArrowLeft /> {backLabel}
        </Button>
        <Button type="submit" disabled={!canSubmit || pending}>
          {pending && <Loader2 className="animate-spin" />}
          Verify and link
        </Button>
      </DialogFooter>
    </form>
  );
}
