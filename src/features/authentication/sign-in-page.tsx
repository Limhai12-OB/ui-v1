"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2, UserCog, UserRound } from "lucide-react";
import { authService, ApiError } from "@/lib/api";
import { useSessionStore } from "@/store/session-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { DemoNotice } from "@/components/shared/demo-notice";
import { AuthHeader, AuthNarrow, AuthSkeleton, GoogleMark, OrDivider, PasswordInput, safeNext, suspendedMessage, useRedirectIfSignedIn } from "./auth-ui";
import { GoogleSignInDialog } from "./google-sign-in-dialog";

const OWNER_EMAIL = "sophea.chan@angkorfresh.demo";
const MANAGER_EMAIL = "dara.kim@angkorfresh.demo";
const DEMO_PASSWORD = "demo-pass-2026";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function SignInPage() {
  const ready = useRedirectIfSignedIn();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const signIn = useSessionStore((s) => s.signIn);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleOpen, setGoogleOpen] = useState(false);

  const { register, handleSubmit, control, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", remember: true },
  });
  const { errors, isSubmitting } = formState;

  const onSubmit = async (v: FormValues) => {
    setFormError(null);
    try {
      const { userId } = await authService.signIn(v.email, v.password);
      const suspended = suspendedMessage(v.email);
      if (suspended) {
        setFormError(suspended);
        return;
      }
      signIn(userId, v.remember);
      router.replace(next);
    } catch (e) {
      setFormError(e instanceof ApiError || e instanceof Error ? e.message : "We couldn't sign you in. Try again.");
    }
  };

  const fillDemo = (email: string) => {
    setFormError(null);
    setValue("email", email, { shouldValidate: true, shouldDirty: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true, shouldDirty: true });
  };

  if (!ready) return <AuthSkeleton />;

  return (
    <AuthNarrow>
      <AuthHeader title="Sign in to LedgerVision" description="Welcome back. Sign in to see your business finances." />

      <Button type="button" variant="outline" className="w-full" size="lg" onClick={() => setGoogleOpen(true)}>
        <GoogleMark /> Continue with Google
      </Button>
      <OrDivider label="or sign in with email" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-error-light px-3 py-2 text-sm text-error-text">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" {...register("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13px] font-medium">
              Password
            </Label>
            <Link href="/forgot-password" className="rounded text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" {...register("password")} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} />
          {errors.password && (
            <p id="password-error" role="alert" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>
        <Controller
          control={control}
          name="remember"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id="remember" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              <Label htmlFor="remember" className="text-sm font-normal">
                Keep me signed in
              </Label>
            </div>
          )}
        />
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" />}
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to LedgerVision?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Create a business account
        </Link>
      </p>

      <div className="mt-8 rounded-xl border border-dashed bg-muted/40 p-4">
        <DemoNotice className="mb-3">
          <strong className="font-semibold">Demo sign-in.</strong> No real authentication runs here — any password with 8 or more characters is accepted for the demo accounts below.
        </DemoNotice>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="secondary" className="h-auto justify-start py-2 text-left" onClick={() => fillDemo(OWNER_EMAIL)}>
            <UserRound aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Business Owner</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">Sophea Chan</span>
            </span>
          </Button>
          <Button type="button" variant="secondary" className="h-auto justify-start py-2 text-left" onClick={() => fillDemo(MANAGER_EMAIL)}>
            <UserCog aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Branch Manager</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">Dara Kim · Toul Kork</span>
            </span>
          </Button>
        </div>
      </div>

      <GoogleSignInDialog open={googleOpen} onOpenChange={setGoogleOpen} next={next} />
    </AuthNarrow>
  );
}

