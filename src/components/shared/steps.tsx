import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  id: string;
  label: string;
  description?: string;
}

/** Horizontal step indicator for multi-step workflows (wizards, reviews). */
export function Steps({ steps, current, className }: { steps: StepDef[]; current: number; className?: string }) {
  return (
    <nav aria-label="Progress" className={cn("overflow-x-auto", className)}>
      <ol className="flex min-w-max items-center gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-primary-light text-primary",
                    !done && !active && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-sm whitespace-nowrap", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.label}
                  <span className="sr-only">{done ? " (completed)" : active ? " (current)" : ""}</span>
                </span>
              </div>
              {i < steps.length - 1 && <span className={cn("h-px w-6 sm:w-10", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
