import {
  CheckCircle2, Circle, Clock, AlertTriangle, XCircle, FileEdit, Send, Ban, Loader2, CircleDashed,
  ArrowRightLeft, ShieldCheck, Undo2, Link2, HelpCircle, Sparkles, PlugZap, Unplug,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "info" | "neutral" | "ai";

interface StatusDef {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  spin?: boolean;
}

/**
 * Every status in the product, in one place. Each has a label and an icon so
 * status is never communicated by color alone.
 */
const STATUS: Record<string, StatusDef> = {
  // invoices / bills / planned purchases
  draft: { label: "Draft", tone: "neutral", icon: FileEdit },
  sent: { label: "Sent", tone: "info", icon: Send },
  open: { label: "Open", tone: "info", icon: Circle },
  partially_paid: { label: "Partially paid", tone: "warning", icon: CircleDashed },
  paid: { label: "Paid", tone: "success", icon: CheckCircle2 },
  overdue: { label: "Overdue", tone: "error", icon: AlertTriangle },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
  void: { label: "Void", tone: "neutral", icon: Ban },
  accepted: { label: "Accepted", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "error", icon: XCircle },
  expired: { label: "Expired", tone: "neutral", icon: Clock },
  converted: { label: "Converted", tone: "ai", icon: ArrowRightLeft },
  // transactions
  posted: { label: "Posted", tone: "success", icon: CheckCircle2 },
  needs_review: { label: "Needs review", tone: "warning", icon: HelpCircle },
  reconciled: { label: "Reconciled", tone: "success", icon: ShieldCheck },
  // imports
  processing: { label: "Processing", tone: "info", icon: Loader2, spin: true },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "error", icon: XCircle },
  // reconciliation & till
  in_progress: { label: "In progress", tone: "info", icon: Clock },
  submitted: { label: "Awaiting sign-off", tone: "warning", icon: Send },
  signed_off: { label: "Signed off", tone: "success", icon: ShieldCheck },
  returned: { label: "Returned", tone: "error", icon: Undo2 },
  matched: { label: "Matched", tone: "success", icon: Link2 },
  suggested: { label: "Suggested", tone: "ai", icon: Sparkles },
  unmatched: { label: "Unmatched", tone: "neutral", icon: HelpCircle },
  discrepancy: { label: "Discrepancy", tone: "error", icon: AlertTriangle },
  // people & branches
  active: { label: "Active", tone: "success", icon: CheckCircle2 },
  inactive: { label: "Inactive", tone: "neutral", icon: Circle },
  invited: { label: "Invited", tone: "info", icon: Send },
  suspended: { label: "Suspended", tone: "error", icon: Ban },
  archived: { label: "Archived", tone: "neutral", icon: Ban },
  // integrations
  connected: { label: "Connected", tone: "success", icon: PlugZap },
  disconnected: { label: "Disconnected", tone: "neutral", icon: Unplug },
  syncing: { label: "Syncing", tone: "info", icon: Loader2, spin: true },
  error: { label: "Error", tone: "error", icon: XCircle },
  success: { label: "Success", tone: "success", icon: CheckCircle2 },
  running: { label: "Running", tone: "info", icon: Loader2, spin: true },
  // reports
  complete: { label: "Complete", tone: "success", icon: CheckCircle2 },
  incomplete: { label: "Incomplete", tone: "warning", icon: AlertTriangle },
  generating: { label: "Generating", tone: "info", icon: Loader2, spin: true },
  // stock
  ok: { label: "In stock", tone: "success", icon: CheckCircle2 },
  low: { label: "Low stock", tone: "warning", icon: AlertTriangle },
  out: { label: "Out of stock", tone: "error", icon: XCircle },
  // health
  good: { label: "Good", tone: "success", icon: CheckCircle2 },
  fair: { label: "Fair", tone: "warning", icon: AlertTriangle },
  poor: { label: "Needs attention", tone: "error", icon: XCircle },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const def = STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" as Tone, icon: Circle };
  const Icon = def.icon;
  return (
    <Badge variant={def.tone} className={cn("gap-1 font-medium", className)}>
      <Icon className={cn("size-3", def.spin && "animate-spin")} aria-hidden />
      {label ?? def.label}
    </Badge>
  );
}
