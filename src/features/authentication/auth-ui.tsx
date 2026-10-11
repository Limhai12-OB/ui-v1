"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSessionStore } from "@/store/session-store";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Layout helpers                                                      */
/* ------------------------------------------------------------------ */

export function AuthHeader({ title, description, icon }: { title: string; description?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1.5">
      {icon && <div className="mb-4">{icon}</div>}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Round icon badge used at the top of confirmation / state screens. */
export function AuthIcon({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "info" | "warning" | "error" }) {
  return (
    <span
      className={cn(
        "flex size-11 items-center justify-center rounded-full [&_svg]:size-5",
        tone === "primary" && "bg-primary-light text-primary",
        tone === "info" && "bg-info-light text-info-text",
        tone === "warning" && "bg-warning-light text-warning-text",
        tone === "error" && "bg-error-light text-error-text",
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** Narrow column for single-form auth screens. */
export function AuthNarrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[400px]", className)}>{children}</div>;
}

export function AuthSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <AuthNarrow>
      <div className="space-y-6" aria-busy="true" aria-label="Loading">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
      </div>
    </AuthNarrow>
  );
}

export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative my-5 flex items-center" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-border" />
      <span className="px-3 text-xs text-muted-foreground uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.55 10.55 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation helpers                                                  */
/* ------------------------------------------------------------------ */

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Sends already signed-in users to the app. Returns true once it is safe to render the form. */
export function useRedirectIfSignedIn(to = "/dashboard"): boolean {
  const hydrated = useHydrated();
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const signedIn = hydrated && status === "signed_in";
  useEffect(() => {
    if (signedIn) router.replace(to);
  }, [signedIn, router, to]);
  return hydrated && !signedIn;
}

/** Returns an error message if the user's branch-manager access is suspended. */
export function suspendedMessage(email: string): string | null {
  const m = useAppStore.getState().managers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  return m?.status === "suspended" ? "This branch manager account is suspended. Ask the Business Owner to reactivate it." : null;
}

/* ------------------------------------------------------------------ */
/* Passwords                                                           */
/* ------------------------------------------------------------------ */

export const PASSWORD_RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: "len", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { id: "letter", label: "Contains a letter", test: (v) => /[A-Za-z]/.test(v) },
  { id: "number", label: "Contains a number", test: (v) => /\d/.test(v) },
];

export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use 72 characters or fewer")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export function passwordScore(v: string): number {
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
  if (!PASSWORD_RULES.every((r) => r.test(v))) score = Math.min(score, 1);
  return score;
}

const STRENGTH = [
  { label: "Too weak", bar: "bg-destructive", text: "text-error-text" },
  { label: "Weak", bar: "bg-destructive", text: "text-error-text" },
  { label: "Fair", bar: "bg-warning", text: "text-warning-text" },
  { label: "Good", bar: "bg-success", text: "text-success-text" },
  { label: "Strong", bar: "bg-success", text: "text-success-text" },
];

/** Strength meter + rule checklist for new passwords. */
export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const score = passwordScore(value);
  const s = STRENGTH[score];
  return (
    <div id={id} className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={cn("h-1 rounded-full transition-colors", value && score >= i ? s.bar : "bg-muted")} />
          ))}
        </div>
        <span className={cn("w-16 text-right text-xs font-medium", value ? s.text : "text-muted-foreground")}>
          <span className="sr-only">Password strength: </span>
          {value ? s.label : "—"}
        </span>
      </div>
      <ul className="grid gap-1 text-xs sm:grid-cols-3">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(value);
          return (
            <li key={r.id} className={cn("flex items-center gap-1.5", ok ? "text-success-text" : "text-muted-foreground")}>
              {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {r.label}
              <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">;

/** Password input with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup className={className}>
      <InputGroupInput ref={ref} type={visible ? "text" : "password"} {...props} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
});

/* ------------------------------------------------------------------ */
/* One-time code                                                       */
/* ------------------------------------------------------------------ */

/** Six individual digit boxes; supports typing, backspace, arrows and paste. */
export function OtpInput({ value, onChange, disabled, invalid, idPrefix = "otp", autoFocus }: { value: string; onChange: (v: string) => void; disabled?: boolean; invalid?: boolean; idPrefix?: string; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, 6));
  };

  return (
    <div className="flex gap-2" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          id={i === 0 ? idPrefix : undefined}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-12 w-full min-w-0 rounded-md border border-input bg-card text-center text-lg font-semibold tabular-nums shadow-xs outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50",
            invalid && "border-destructive",
          )}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return setAt(i, "");
            if (v.length > 1) {
              const merged = (value.slice(0, i) + v).slice(0, 6);
              onChange(merged);
              refs.current[Math.min(merged.length, 5)]?.focus();
              return;
            }
            setAt(i, v);
            if (i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              e.preventDefault();
              setAt(i - 1, "");
              refs.current[i - 1]?.focus();
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!text) return;
            e.preventDefault();
            onChange(text);
            refs.current[Math.min(text.length, 5)]?.focus();
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

/** Countdown used for "resend code" cooldowns. */
export function useCooldown(seconds: number, startImmediately = true) {
  const [left, setLeft] = useState(startImmediately ? seconds : 0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: () => setLeft(seconds) };
}
