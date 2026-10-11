import type { AccountType, FinancialAccount, ID, ISODate, Reconciliation, Transaction } from "@/types";
import { transactionEffect } from "@/lib/domain";
import { roundMoney } from "@/lib/currency";
import { addDaysISO, today } from "@/lib/date";
import { Banknote, Landmark, Smartphone, type LucideIcon } from "lucide-react";

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; plural: string; icon: LucideIcon }> = {
  bank: { label: "Bank", plural: "Bank accounts", icon: Landmark },
  ewallet: { label: "E-wallet", plural: "E-wallets", icon: Smartphone },
  cash: { label: "Cash", plural: "Cash drawers", icon: Banknote },
};

export interface AccountFlows {
  moneyIn: number;
  moneyOut: number;
  net: number;
  count: number;
}

/** Money in/out of a single account (its own currency), including transfers. */
export function accountFlows(account: FinancialAccount, txs: Transaction[], start: ISODate, end: ISODate = today()): AccountFlows {
  let moneyIn = 0;
  let moneyOut = 0;
  let count = 0;
  for (const t of txs) {
    if (t.date < start || t.date > end) continue;
    const e = transactionEffect(t, account.id);
    if (e === 0) continue;
    count++;
    if (e > 0) moneyIn += e;
    else moneyOut -= e;
  }
  const c = account.currency;
  return { moneyIn: roundMoney(moneyIn, c), moneyOut: roundMoney(moneyOut, c), net: roundMoney(moneyIn - moneyOut, c), count };
}

export function last30Start(): ISODate {
  return addDaysISO(today(), -29);
}

export function touchesAccount(t: Transaction, accountId: ID): boolean {
  return t.accountId === accountId || t.toAccountId === accountId;
}

export function lastActivity(accountId: ID, txs: Transaction[]): ISODate | undefined {
  let last: ISODate | undefined;
  for (const t of txs) if (touchesAccount(t, accountId) && t.date <= today() && (!last || t.date > last)) last = t.date;
  return last;
}

export function latestReconciliation(accountId: ID, recons: Reconciliation[]): Reconciliation | undefined {
  return recons.filter((r) => r.accountId === accountId).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
}
