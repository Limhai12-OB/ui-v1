"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MailCheck, MailQuestion } from "lucide-react";
import { authService, ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthIcon, AuthNarrow, AuthSkeleton, OtpInput, useCooldown } from "./auth-ui";

export function VerifyEmailPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const pending = useSessionStore((s) => s.pendingOwner);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCooldown(30);

  if (!hydrated) return <AuthSkeleton fields={1} />;

  if (!pending) {
    return (
      <AuthNarrow>
        <AuthHeader
          icon={<AuthIcon tone="warning"><MailQuestion /></AuthIcon>}
          title="Nothing to verify yet"
          description="Email verification starts after you create a Business Owner account. If you already have an account, sign in instead."
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <Link href="/sign-up">Create an account</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </AuthNarrow>
    );
  }

  const verify = async (value = code) => {
    setError(null);
    setVerifying(true);
    try {
      await authService.verifyEmail(value);
      toast.success("Email verified");
      router.push("/business-setup");
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Verification failed.");
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    await new Promise((r) => setTimeout(r, 600));
    setResending(false);
    setCode("");
    setError(null);
    cooldown.restart();
    toast.success("New code ready", { description: "Simulated — no email is sent in the demo." });
  };

  return (
    <AuthNarrow>
      <AuthHeader
        icon={<AuthIcon><MailCheck /></AuthIcon>}
        title="Verify your email"
        description={
          <>
            Enter the 6-digit code we sent to <span className="font-medium text-foreground">{pending.email}</span>.
          </>
        }
      />
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) verify();
        }}
      >
        <Field label="Verification code" htmlFor="otp" error={error ?? undefined}>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            disabled={verifying}
            invalid={!!error}
            autoFocus
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || verifying}>
          {verifying && <Loader2 className="animate-spin" />}
          {verifying ? "Verifying…" : "Verify email"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Didn’t get a code?</span>
          <Button type="button" variant="link" className="h-auto p-0" onClick={resend} disabled={cooldown.left > 0 || resending}>
            {resending && <Loader2 className="animate-spin" />}
            {cooldown.left > 0 ? <span className="tabular-nums">Resend in 0:{String(cooldown.left).padStart(2, "0")}</span> : "Resend code"}
          </Button>
        </div>
        <DemoNotice>No email is sent in the demo — enter any 6 digits to continue.</DemoNotice>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Wrong email?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Start again
        </Link>
      </p>
    </AuthNarrow>
  );
}
