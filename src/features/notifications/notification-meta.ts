import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import type { NotificationSeverity } from "@/types";

export const NOTIFICATION_SEVERITY: Record<NotificationSeverity, { label: string; icon: LucideIcon; className: string }> = {
  error: { label: "Critical", icon: AlertOctagon, className: "bg-error-light text-error-text" },
  warning: { label: "Warning", icon: AlertTriangle, className: "bg-warning-light text-warning-text" },
  info: { label: "Info", icon: Info, className: "bg-info-light text-info-text" },
  success: { label: "Success", icon: CheckCircle2, className: "bg-success-light text-success-text" },
};
