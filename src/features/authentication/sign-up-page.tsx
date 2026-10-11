"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { authService, ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { AuthHeader, AuthNarrow, AuthSkeleton, GoogleMark, OrDivider, PasswordInput, PasswordStrength, newPasswordSchema, useRedirectIfSignedIn } from "./auth-ui";
import { GoogleSignInDialog } from "./google-sign-in-dialog";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80, "Keep it under 80 characters"),
    email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
    password: newPasswordSchema,
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type FormValues = z.infer<typeof schema>;

export function SignUpPage() {
  const ready = useRedirectIfSignedIn();
  const router = useRouter();
  const startSignUp = useSessionStore((s) => s.startSignUp);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleOpen, setGoogleOpen] = useState(false);

  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });
  const { errors, isSubmitting } = formState;
  const password = useWatch({ control, name: "password" });

  const onSubmit = async (v: FormValues) => {
    setFormError(null);
    try {
      await authService.signUp(v.name.trim(), v.email.trim(), v.password);
      startSignUp(v.name.trim(), v.email.trim());
      router.push("/verify-email");
    } catch (e) {
      setFormError(e instanceof ApiError || e instanceof Error ? e.message : "We couldn't create your account. Try again.");
    }
  };

  if (!ready) return <AuthSkeleton fields={4} />;

  return (
    <AuthNarrow>
      <AuthHeader title="Create your business account" description="Set up LedgerVision for your business in a few minutes." />

      <div className="mb-5 flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Sign-up is for <span className="font-medium text-foreground">Business Owners</span>. Branch managers join by invitation — open the invitation link your owner sent you.
        </p>
      </div>

      <Button type="button" variant="outline" className="w-full" size="lg" onClick={() => setGoogleOpen(true)}>
        <GoogleMark /> Sign up with Google
      </Button>
      <OrDivider label="or with email" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-error-light px-3 py-2 text-sm text-error-text">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {formError}{" "}
              <Link href="/sign-in" className="font-medium underline">
                Go to sign in
              </Link>
            </span>
          </div>
        )}
        <Field label="Full name" htmlFor="name" required error={errors.name?.message}>
          <Input id="name" autoComplete="name" autoFocus {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Work email" htmlFor="email" required error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" required error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" {...register("password")} aria-invalid={!!errors.password} aria-describedby="password-strength" />
        </Field>
        <PasswordStrength id="password-strength" value={password ?? ""} />
        <Field label="Confirm password" htmlFor="confirm" required error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" {...register("confirm")} aria-invalid={!!errors.confirm} />
        </Field>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">By creating an account you agree to the demo terms. No real account is created — data stays in your browser.</p>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>

      <GoogleSignInDialog open={googleOpen} onOpenChange={setGoogleOpen} next="/dashboard" />
    </AuthNarrow>
  );
}
