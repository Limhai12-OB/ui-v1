"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, Loader2, MailCheck } from "lucide-react";
import { authService } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthIcon, AuthNarrow } from "./auth-ui";

const schema = z.object({ email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { email: "" } });
  const { errors, isSubmitting } = formState;

  const onSubmit = async (v: FormValues) => {
    // Always show the same confirmation, whether or not the account exists (prevents account enumeration).
    await authService.requestPasswordReset(v.email.trim()).catch(() => undefined);
    setSentTo(v.email.trim());
  };

  if (sentTo) {
    return (
      <AuthNarrow>
        <AuthHeader
          icon={<AuthIcon><MailCheck /></AuthIcon>}
          title="Check your email"
          description={
            <>
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we’ve sent a link to reset your password. The link expires in 30 minutes.
            </>
          }
        />
        <div role="status" className="space-y-4">
          <DemoNotice>
            No email is sent in the demo. Open the reset page directly with a demo token:{" "}
            <Link href="/reset-password?token=demo" className="font-medium underline">
              Reset password (demo link)
            </Link>
          </DemoNotice>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link href="/sign-in">Back to sign in</Link>
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setSentTo(null)}>
              Use a different email
            </Button>
          </div>
        </div>
      </AuthNarrow>
    );
  }

  return (
    <AuthNarrow>
      <AuthHeader icon={<AuthIcon><KeyRound /></AuthIcon>} title="Forgot your password?" description="Enter the email you use for LedgerVision and we'll send you a link to reset it." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@business.com" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Sending link…" : "Send reset link"}
        </Button>
      </form>
      <Link href="/sign-in" className="mt-6 inline-flex items-center gap-1 rounded text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>
    </AuthNarrow>
  );
}
