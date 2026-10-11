"use client";

import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import type { HealthFactor, HealthScore } from "@/lib/analytics";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Status = HealthFactor["status"];

const STATUS_META: Record<Status, { label: string; icon: LucideIcon; text: string; stroke: string; bar: string; summary: string }> = {
  good: { label: "Healthy", icon: CheckCircle2, text: "text-success-text", stroke: "stroke-success", bar: "bg-success", summary: "Your business is in good shape overall." },
  fair: { label: "Fair", icon: AlertTriangle, text: "text-warning-text", stroke: "stroke-warning", bar: "bg-warning", summary: "Some areas need attention to stay on track." },
  poor: { label: "Needs attention", icon: XCircle, text: "text-error-text", stroke: "stroke-error", bar: "bg-error", summary: "Several areas are under pressure — act on the weakest factors first." },
};

function Gauge({ score, status }: { score: number; status: Status }) {
  const M = STATUS_META[status];
  return (
    <div className="relative mx-auto w-full max-w-[220px]">
      <svg viewBox="0 0 200 112" className="w-full" role="img" aria-label={`Business health score ${score} out of 100, ${M.label}`}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" className="stroke-muted" strokeWidth={14} strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" className={cn(M.stroke, "transition-[stroke-dasharray] duration-700")} strokeWidth={14} strokeLinecap="round" pathLength={100} strokeDasharray={`${Math.max(score, 0.5)} 100`} />
        {/* thresholds: fair at 45, good at 70 */}
        {[45, 70].map((t) => {
          const a = Math.PI * (1 - t / 100);
          const x1 = 100 + Math.cos(a) * 66;
          const y1 = 100 - Math.sin(a) * 66;
          const x2 = 100 + Math.cos(a) * 60;
          const y2 = 100 - Math.sin(a) * 60;
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted-foreground/50" strokeWidth={1.5} />;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-4xl font-semibold tracking-tight tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

export function HealthCard({ health, loading }: { health: HealthScore; loading: boolean }) {
  const M = STATUS_META[health.status];
  const weakest = [...health.factors].sort((a, b) => a.score - b.score)[0];
  return (
    <Card className="h-full gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Business health score</CardTitle>
        <CardDescription>Six factors from the last 90 days of activity in this scope.</CardDescription>
      </CardHeader>
      {loading ? (
        <div className="grid gap-6 p-5 md:grid-cols-[200px_1fr]" aria-busy="true" aria-label="Loading health score">
          <Skeleton className="mx-auto h-28 w-48 rounded-t-full" />
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 md:grid-cols-[200px_1fr]">
          <div className="flex flex-col items-center gap-3 text-center">
            <Gauge score={health.overall} status={health.status} />
            <p className={cn("inline-flex items-center gap-1.5 text-sm font-medium", M.text)}>
              <M.icon className="size-4" aria-hidden />
              {M.label}
            </p>
            <p className="text-xs text-muted-foreground">{M.summary}</p>
            {weakest && (
              <p className="text-xs text-muted-foreground">
                Weakest factor: <span className="font-medium text-foreground">{weakest.label}</span>
              </p>
            )}
          </div>
          <ul className="space-y-3.5">
            {health.factors.map((f) => {
              const F = STATUS_META[f.status];
              return (
                <li key={f.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{f.label}</span>
                    <span className="flex items-center gap-2 text-xs">
                      <span className={cn("inline-flex items-center gap-1", F.text)}>
                        <F.icon className="size-3" aria-hidden />
                        {f.status === "poor" ? "Weak" : f.status === "fair" ? "Fair" : "Good"}
                      </span>
                      <span className="w-7 text-right font-medium tabular-nums">{f.score}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.score} aria-label={`${f.label} score`}>
                    <div className={cn("h-full rounded-full", F.bar)} style={{ width: `${Math.max(f.score, 2)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
