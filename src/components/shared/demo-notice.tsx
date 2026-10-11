import { FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Honest labelling for simulated behavior in the frontend demo. */
export function DemoNotice({ children, className, variant = "demo" }: { children: React.ReactNode; className?: string; variant?: "demo" | "ai" }) {
  const Icon = variant === "ai" ? Sparkles : FlaskConical;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        variant === "ai" ? "border-ai/25 bg-ai-light text-ai-text" : "border-info/25 bg-info-light text-info-text",
        className,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Small pill that marks a value or panel as produced by the simulated AI. */
export function AIBadge({ label = "AI suggestion", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-ai-light px-1.5 py-0.5 text-[11px] font-medium text-ai-text", className)}>
      <Sparkles className="size-3" aria-hidden />
      {label}
    </span>
  );
}
