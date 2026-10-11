import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M9 22.5V9.5h3v10.2h6.2v2.8H9Z" fill="white" />
      <path d="M17.5 17.2 20.4 9.5h3.1l-4.6 13h-2.1l-1-2.9 1.7-2.4Z" fill="white" fillOpacity=".75" />
    </svg>
  );
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && <span className="text-base font-semibold tracking-tight text-foreground">LedgerVision</span>}
    </span>
  );
}
