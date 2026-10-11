import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatPercent } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Percent change vs comparison period. */
  delta?: number | null;
  /** When true, a decrease is good (e.g. expenses). */
  invertDelta?: boolean;
  deltaLabel?: string;
  /** Custom delta text (e.g. percentage points). Defaults to a signed percent. */
  formatDelta?: (delta: number) => string;
  description?: React.ReactNode;
  className?: string;
}

/** KPI tile: label, value, icon, comparison and context. */
export function StatCard({ label, value, icon: Icon, delta, invertDelta, deltaLabel = "vs last month", formatDelta, description, className }: StatCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const up = hasDelta && delta! > 0.05;
  const down = hasDelta && delta! < -0.05;
  const good = invertDelta ? down : up;
  const bad = invertDelta ? up : down;
  const DeltaIcon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <Card className={cn("gap-3 p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="space-y-1">
        {hasDelta && (
          <p className="flex items-center gap-1 text-xs">
            <span className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-medium", good && "bg-success-light text-success-text", bad && "bg-error-light text-error-text", !good && !bad && "bg-muted text-muted-foreground")}>
              <DeltaIcon className="size-3" aria-hidden />
              {formatDelta ? formatDelta(delta!) : formatPercent(delta!, 1, true)}
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </p>
        )}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </Card>
  );
}
