import Link from "next/link";
import { Building2, Landmark, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const BENEFITS = [
  {
    icon: Landmark,
    title: "Every account in one ledger",
    body: "ABA, ACLEDA, Wing and cash drawers — in USD and KHR, never mixed without your rate.",
  },
  {
    icon: Building2,
    title: "Built for multi-branch retail",
    body: "Branch managers work in their own branch. You review tills and reconciliations for all.",
  },
  {
    icon: Sparkles,
    title: "AI help you can check",
    body: "Suggested categories, receipt extraction and advisor answers are always labelled for review.",
  },
];

/** Authentication & onboarding layout — separate from the dashboard shell. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between border-r bg-card px-10 py-10 lg:flex xl:px-14">
        <Link href="/sign-in" className="w-fit rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="LedgerVision home">
          <Logo />
        </Link>

        <div className="max-w-md space-y-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">Financial management for Cambodian retail</p>
            <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-foreground">Know where every dollar and riel goes — across every branch.</h2>
            <p className="text-sm text-muted-foreground">LedgerVision brings your bank, cash, sales and stock together so you can close the day with confidence.</p>
          </div>
          <ul className="space-y-5">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                  <b.icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{b.title}</p>
                  <p className="text-sm text-muted-foreground">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden />
          Frontend demo · fictional business data · no real accounts or emails
        </p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-6 lg:hidden">
          <Link href="/sign-in" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="LedgerVision home">
            <Logo />
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-14 lg:items-center lg:px-10">
          <div className="w-full max-w-xl">{children}</div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-muted-foreground sm:px-6">© 2026 LedgerVision · Demo build</footer>
      </div>
    </div>
  );
}
