"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, ExternalLink, Loader2, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope, useCan } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { useLookups } from "@/hooks/use-lookup";
import { transactionService } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatMoney } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailList } from "@/components/shared/detail-list";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AIBadge } from "@/components/shared/demo-notice";
import { CategorySelect } from "@/components/forms/entity-selects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SOURCE_LABEL, TYPE_LABEL, sourceLink } from "./meta";
import { TxAmount } from "./tx-amount";

export function TransactionDetail({ id }: { id: string }) {
  const router = useRouter();
  const tx = useAppStore((s) => s.transactions.find((t) => t.id === id));
  const { inScope } = useScope();
  const canSeeIntegrations = useCan("integrations.manage");
  const lk = useLookups();
  const [deleting, setDeleting] = useState(false);
  const [draftCategory, setDraftCategory] = useState<string | undefined>();

  const [removed, setRemoved] = useState(false);
  const remove = useAction(async (txId: string) => {
    setRemoved(true);
    try {
      await transactionService.remove(txId);
    } catch (e) {
      setRemoved(false);
      throw e;
    }
  }, {
    success: "Transaction deleted",
    onSuccess: () => router.push("/transactions"),
  });
  const updateCategory = useAction(
    async (categoryId: string) => {
      if (!tx) return;
      // Confirming a needs-review transaction also resolves its import batch.
      if (tx.status === "needs_review") await transactionService.categorize([tx.id], categoryId);
      else await transactionService.update(tx.id, { categoryId });
    },
    { success: "Category updated", onSuccess: () => setDraftCategory(undefined) },
  );
  const acceptSuggestion = useAction(async () => tx && transactionService.categorize([tx.id], tx.suggestedCategoryId), {
    success: "AI suggestion accepted — transaction posted",
  });

  if (!tx && removed) return <PageSkeleton />;
  if (!tx || !inScope(tx.branchId)) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Transaction not found"
        description="It may have been deleted, or it belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/transactions">Back to transactions</Link>
          </Button>
        }
      />
    );
  }

  const account = lk.account(tx.accountId);
  const toAccount = lk.account(tx.toAccountId);
  const link = sourceLink(tx);
  const deletable = tx.source === "manual" && !tx.reconciled;
  const suggestion = tx.status === "needs_review" && tx.suggestedCategoryId ? lk.category(tx.suggestedCategoryId) : undefined;
  const categoryValue = draftCategory ?? tx.categoryId;
  const categoryChanged = draftCategory !== undefined && draftCategory !== tx.categoryId;

  return (
    <>
      <PageHeader
        title={tx.description}
        backHref="/transactions"
        backLabel="Transactions"
        meta={
          <>
            <StatusBadge status={tx.status} />
            {tx.reconciled && <StatusBadge status="reconciled" />}
          </>
        }
        description={`${TYPE_LABEL[tx.type]} · ${formatDate(tx.date)} · ${lk.branchName(tx.branchId)}`}
        actions={
          deletable ? (
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="gap-4">
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{tx.type === "income" ? "Money in" : tx.type === "expense" ? "Money out" : "Transferred"}</p>
                <TxAmount tx={tx} className="text-3xl font-semibold tracking-tight" />
              </div>
              <div className="text-right text-sm">
                <p className="text-muted-foreground">{tx.type === "transfer" ? "From → to" : "Account"}</p>
                <p className="font-medium">
                  {account ? (
                    <Link href={`/accounts/${account.id}`} className="hover:underline">
                      {account.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {toAccount && (
                    <>
                      <span className="text-muted-foreground"> → </span>
                      <Link href={`/accounts/${toAccount.id}`} className="hover:underline">
                        {toAccount.name}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Date", value: formatDate(tx.date) },
                  { label: "Type", value: TYPE_LABEL[tx.type] },
                  { label: "Amount", value: `${formatMoney(tx.amount, tx.currency)} ${tx.currency}` },
                  { label: "Branch", value: lk.branchName(tx.branchId) },
                  { label: tx.type === "income" ? "Received from" : tx.type === "expense" ? "Paid to" : "Counterparty", value: tx.counterparty || "—" },
                  { label: "Reference", value: tx.reference ? <span className="font-mono text-xs">{tx.reference}</span> : "—" },
                  { label: "Description", value: tx.description, className: "sm:col-span-2" },
                ]}
              />
            </CardContent>
          </Card>

          {tx.type !== "transfer" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category</CardTitle>
                <CardDescription>
                  {tx.status === "needs_review" ? "This transaction is waiting for a category. Confirming one posts it to your reports." : "Used for profit & loss, budgets and the AI advisor."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {suggestion && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ai/25 bg-ai-light/60 p-3">
                    <div className="space-y-1">
                      <AIBadge />
                      <p className="text-sm">
                        Suggested category: <span className="font-medium">{suggestion.name}</span>
                        {tx.suggestionConfidence !== undefined && <span className="text-muted-foreground tabular-nums"> · {Math.round(tx.suggestionConfidence * 100)}% confidence</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">Simulated suggestion based on the description and counterparty.</p>
                    </div>
                    <Button size="sm" onClick={() => acceptSuggestion.fire()} disabled={acceptSuggestion.pending || updateCategory.pending}>
                      {acceptSuggestion.pending ? <Loader2 className="animate-spin" /> : <Check />} Accept suggestion
                    </Button>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="tx-cat" className="text-[13px]">
                      {tx.categoryId ? "Assigned category" : "Assign a category"}
                    </Label>
                    <CategorySelect id="tx-cat" kind={tx.type === "income" ? "income" : "expense"} value={categoryValue} onChange={setDraftCategory} placeholder="Uncategorized" />
                  </div>
                  <div className="flex gap-2">
                    {categoryChanged && (
                      <Button variant="ghost" onClick={() => setDraftCategory(undefined)} disabled={updateCategory.pending}>
                        Cancel
                      </Button>
                    )}
                    <Button onClick={() => draftCategory && updateCategory.fire(draftCategory)} disabled={!categoryChanged || updateCategory.pending}>
                      {updateCategory.pending && <Loader2 className="animate-spin" />}
                      {tx.status === "needs_review" ? "Confirm & post" : "Save category"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source & audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DetailList
                columns={1}
                items={[
                  {
                    label: "Source",
                    value: (
                      <div className="space-y-1">
                        <Badge variant="outline">{SOURCE_LABEL[tx.source]}</Badge>
                        {link && (
                          <Link href={link.href} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                            {link.label} <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                        )}
                        {tx.source === "integration" &&
                          (canSeeIntegrations ? (
                            <Link href="/integrations" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                              View integrations <ExternalLink className="size-3.5" aria-hidden />
                            </Link>
                          ) : (
                            <p className="text-xs text-muted-foreground">Posted automatically by the POS integration.</p>
                          ))}
                        {tx.source === "manual" && <p className="text-xs text-muted-foreground">Entered by hand in LedgerVision.</p>}
                      </div>
                    ),
                  },
                  { label: "Created by", value: tx.createdBy },
                  { label: "Created at", value: formatDateTime(tx.createdAt) },
                  { label: "Branch", value: lk.branchName(tx.branchId) },
                  {
                    label: "Account",
                    value: account ? (
                      <Link href={`/accounts/${account.id}`} className="font-medium text-primary hover:underline">
                        {account.name} <span className="text-muted-foreground">· {account.accountNumber}</span>
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Reconciliation",
                    value: tx.reconciled ? (
                      <span className="inline-flex items-center gap-1 text-success-text">
                        <ShieldCheck className="size-4" aria-hidden /> Reconciled with bank statement
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not reconciled yet</span>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
          {!deletable && (
            <div className={cn("flex gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground")}>
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p>
                {tx.reconciled
                  ? "Reconciled transactions are locked and can't be deleted."
                  : `Created from ${SOURCE_LABEL[tx.source].toLowerCase()} — change or reverse it from its source record instead of deleting it here.`}
              </p>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this transaction?"
        description={`“${tx.description}” (${tx.type === "expense" ? "−" : tx.type === "income" ? "+" : ""}${formatMoney(tx.amount, tx.currency)}) will be removed and ${account?.name ?? "the account"} balance will be recalculated. This can't be undone.`}
        confirmLabel="Delete transaction"
        destructive
        onConfirm={() => remove.run(tx.id)}
      />
    </>
  );
}
