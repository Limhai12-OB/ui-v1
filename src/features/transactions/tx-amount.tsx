import { ArrowLeftRight } from "lucide-react";
import type { Transaction } from "@/types";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

/** Signed transaction amount: +green income, −red expense, neutral transfer — in its own currency. */
export function TxAmount({ tx, className }: { tx: Pick<Transaction, "type" | "amount" | "currency">; className?: string }) {
  if (tx.type === "transfer") {
    return (
      <span className={cn("inline-flex items-center gap-1 tabular-nums whitespace-nowrap text-foreground", className)}>
        <ArrowLeftRight className="size-3.5 text-muted-foreground" aria-label="Transfer" />
        {formatMoney(tx.amount, tx.currency)}
      </span>
    );
  }
  const income = tx.type === "income";
  return (
    <span className={cn("tabular-nums whitespace-nowrap font-medium", income ? "text-success-text" : "text-error-text", className)}>
      <span className="sr-only">{income ? "Money in " : "Money out "}</span>
      {income ? "+" : "−"}
      {formatMoney(tx.amount, tx.currency)}
    </span>
  );
}
