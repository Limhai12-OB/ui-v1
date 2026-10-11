/**
 * Monthly report readiness — the real conditions that make a report
 * "incomplete": any bank / e-wallet account in scope without a signed-off
 * reconciliation covering the month, and uncategorized transactions in the
 * month. Used both when generating a report and to show live fix links.
 */
import type { FinancialAccount, ID, Reconciliation, Transaction } from "@/types";
import type { Scope } from "@/lib/analytics";
import { formatMonth, monthRange } from "@/lib/date";

export interface ReadinessIssue {
  key: string;
  kind: "reconciliation" | "uncategorized";
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
}

const RECON_STATE: Record<Reconciliation["status"], string> = {
  in_progress: "is in progress",
  submitted: "awaits owner sign-off",
  returned: "was returned for correction",
  signed_off: "is signed off",
};

export function reportReadiness(
  month: string,
  data: { accounts: FinancialAccount[]; reconciliations: Reconciliation[]; transactions: Transaction[] },
  scope: Scope,
): ReadinessIssue[] {
  const { start, end } = monthRange(month);
  const issues: ReadinessIssue[] = [];
  const inScope = (id: ID) => scope.branchIds.includes(id);
  const accounts = data.accounts.filter((a) => (a.type === "bank" || a.type === "ewallet") && a.status === "active" && inScope(a.branchId) && a.openingDate <= end);
  for (const a of accounts) {
    const recs = data.reconciliations.filter((r) => r.accountId === a.id && r.periodStart <= end && r.periodEnd >= start);
    const signed = recs.find((r) => r.status === "signed_off" && r.periodStart <= start && r.periodEnd >= end);
    if (signed) continue;
    const latest = [...recs].sort((x, y) => y.periodEnd.localeCompare(x.periodEnd))[0];
    issues.push({
      key: `recon:${a.id}`,
      kind: "reconciliation",
      label: `${a.name} reconciliation for ${formatMonth(month)} ${latest ? RECON_STATE[latest.status] : "has not been started"}`,
      detail: latest ? "Figures from this account aren't confirmed against the bank statement until the reconciliation is signed off." : "No reconciliation exists for this account and month.",
      href: latest ? `/reconciliation/${latest.id}` : "/reconciliation/new",
      actionLabel: latest ? (latest.status === "submitted" ? "Review & sign off" : "Open reconciliation") : "Start reconciliation",
    });
  }
  const uncategorized = data.transactions.filter((t) => t.date >= start && t.date <= end && inScope(t.branchId) && t.type !== "transfer" && (t.status === "needs_review" || !t.categoryId));
  if (uncategorized.length) {
    issues.push({
      key: "uncategorized",
      kind: "uncategorized",
      label: `${uncategorized.length} uncategorized transaction${uncategorized.length === 1 ? "" : "s"} in ${formatMonth(month)}`,
      detail: "Uncategorized transactions are excluded from revenue and expense totals until they are reviewed.",
      href: "/banking/uncategorized",
      actionLabel: "Review transactions",
    });
  }
  return issues;
}
