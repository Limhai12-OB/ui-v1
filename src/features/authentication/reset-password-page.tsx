"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, KeyRound, Link2Off, Loader2 } from "lucide-react";
import { authService } from "@/lib/api";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthIcon, AuthNarrow, PasswordInput, PasswordStrength, newPasswordSchema } from "./auth-ui";

const schema = z
  .object({ password: newPasswordSchema, confirm: z.string().min(1, "Confirm your new password") })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  const token = useSearchParams().get("token");
  const [done, setDone] = useState(false);
  const { register, handleSubmit, control, formState } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { password: "", confirm: "" } });
  const { errors, isValid } = formState;
  const password = useWatch({ control, name: "password" });
  const reset = useAction(async (v: FormValues): Promise<void> => void (await authService.resetPassword(token ?? "", v.password)), { onSuccess: () => setDone(true) });

  if (!token) {
    return (
      <AuthNarrow>
        <AuthHeader
          icon={<AuthIcon tone="error"><Link2Off /></AuthIcon>}
          title="This reset link isn't valid"
          description="The link is missing its security token or has expired. Request a new link to reset your password."
        />
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </AuthNarrow>
    );
  }

  if (done) {
    return (
      <AuthNarrow>
        <AuthHeader icon={<AuthIcon><CheckCircle2 /></AuthIcon>} title="Password updated" description="Your password has been reset. Sign in with your new password to continue." />
        <div role="status" className="space-y-4">
          <Button asChild size="lg" className="w-full">
            <Link href="/sign-in">Continue to sign in</Link>
          </Button>
          <DemoNotice>Passwords aren’t stored in the demo — demo accounts still accept any password with 8+ characters.</DemoNotice>
        </div>
      </AuthNarrow>
    );
  }

  return (
    <AuthNarrow>
      <AuthHeader icon={<AuthIcon><KeyRound /></AuthIcon>} title="Set a new password" description="Choose a strong password you don't use for other services." />
      <form onSubmit={handleSubmit((v) => reset.fire(v))} noValidate className="space-y-4">
        <Field label="New password" htmlFor="password" required error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" autoFocus {...register("password")} aria-invalid={!!errors.password} aria-describedby="pw-strength" />
        </Field>
        <PasswordStrength id="pw-strength" value={password ?? ""} />
        <Field label="Confirm new password" htmlFor="confirm" required error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" {...register("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={!isValid || reset.pending}>
          {reset.pending && <Loader2 className="animate-spin" />}
          {reset.pending ? "Updating…" : "Update password"}
        </Button>
      </form>
      {token === "demo" && <DemoNotice className="mt-4">You’re using the demo reset token.</DemoNotice>}
    </AuthNarrow>
  );
}
