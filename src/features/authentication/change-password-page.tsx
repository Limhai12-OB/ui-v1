"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { authService } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { useCurrentUser } from "@/hooks/use-scope";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAction } from "@/hooks/use-action";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthIcon, AuthNarrow, AuthSkeleton, PasswordInput, PasswordStrength, newPasswordSchema } from "./auth-ui";

const schema = z
  .object({
    current: z.string().min(1, "Enter your current or temporary password"),
    password: newPasswordSchema,
    confirm: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Choose a password different from the current one" });
type FormValues = z.infer<typeof schema>;

export function ChangePasswordPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const signedIn = useSessionStore((s) => s.status === "signed_in");
  const user = useCurrentUser();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, control, formState } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { current: "", password: "", confirm: "" } });
  const { errors, isValid } = formState;
  const password = useWatch({ control, name: "password" });

  const change = useAction(async (v: FormValues): Promise<void> => void (await authService.changePassword(v.current, v.password)), {
    onSuccess: () => {
      if (signedIn) {
        toast.success("Password changed");
        router.push("/dashboard");
      } else setDone(true);
    },
  });

  if (!hydrated) return <AuthSkeleton fields={3} />;

  if (done) {
    return (
      <AuthNarrow>
        <AuthHeader icon={<AuthIcon><CheckCircle2 /></AuthIcon>} title="Password changed" description="Your new password is set. Sign in with it to continue." />
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">Continue to sign in</Link>
        </Button>
      </AuthNarrow>
    );
  }

  return (
    <AuthNarrow>
      <AuthHeader
        icon={<AuthIcon><KeyRound /></AuthIcon>}
        title={signedIn ? "Change your password" : "Set your own password"}
        description={
          signedIn ? (
            <>
              Signed in as <span className="font-medium text-foreground">{user.email}</span>. You’ll stay signed in on this device.
            </>
          ) : (
            "Invited branch managers who received a temporary password must replace it before using LedgerVision."
          )
        }
      />
      <form onSubmit={handleSubmit((v) => change.fire(v))} noValidate className="space-y-4">
        <Field label={signedIn ? "Current password" : "Temporary password"} htmlFor="cp-current" required error={errors.current?.message}>
          <PasswordInput id="cp-current" autoComplete="current-password" autoFocus {...register("current")} aria-invalid={!!errors.current} />
        </Field>
        <Field label="New password" htmlFor="cp-new" required error={errors.password?.message}>
          <PasswordInput id="cp-new" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} aria-describedby="cp-strength" />
        </Field>
        <PasswordStrength id="cp-strength" value={password ?? ""} />
        <Field label="Confirm new password" htmlFor="cp-confirm" required error={errors.confirm?.message}>
          <PasswordInput id="cp-confirm" autoComplete="new-password" {...register("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
          <Button asChild variant="outline" className="flex-1">
            <Link href={signedIn ? "/profile" : "/sign-in"}>Cancel</Link>
          </Button>
          <Button type="submit" className="flex-1" disabled={!isValid || change.pending}>
            {change.pending && <Loader2 className="animate-spin" />}
            {change.pending ? "Saving…" : "Change password"}
          </Button>
        </div>
        <DemoNotice>Passwords aren’t stored or checked in the demo — this simulates the request to the authentication service.</DemoNotice>
      </form>
    </AuthNarrow>
  );
}
