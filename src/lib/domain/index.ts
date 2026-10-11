/**
 * Pure domain calculations shared by every feature.
 * Derived values (balances, overdue status, totals) are always computed here
 * rather than stored, so all views stay consistent with the same data.
 */
import type {
  Bill,
  BillStatus,
  FinancialAccount,
  Invoice,
  InvoiceStatus,
  Item,
  LineItem,
  PlannedPurchase,
  PlannedPurchaseStatus,
  Transaction,
  Currency,
  ID,
} from "@/types";
import { roundMoney } from "@/lib/currency";
import { today } from "@/lib/date";

export function lineTotal(line: Pick<LineItem, "quantity" | "unitPrice">): number {
  return line.quantity * line.unitPrice;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function documentTotals(lines: LineItem[], discount: number, taxRate: number, currency: Currency): DocumentTotals {
  const subtotal = roundMoney(lines.reduce((s, l) => s + lineTotal(l), 0), currency);
  const taxable = Math.max(0, subtotal - discount);
  const tax = roundMoney((taxable * taxRate) / 100, currency);
  return { subtotal, discount, tax, total: roundMoney(taxable + tax, currency) };
}

export interface InvoiceTotals extends DocumentTotals {
  paid: number;
  balance: number;
}

export function invoiceTotals(inv: Invoice): InvoiceTotals {
  const t = documentTotals(inv.lines, inv.discount, inv.taxRate, inv.currency);
  const paid = roundMoney(inv.payments.reduce((s, p) => s + p.amount, 0), inv.currency);
  return { ...t, paid, balance: roundMoney(Math.max(0, t.total - paid), inv.currency) };
}

export function invoiceStatus(inv: Invoice, asOf = today()): InvoiceStatus {
  if (inv.baseStatus === "cancelled") return "cancelled";
  if (inv.baseStatus === "draft") return "draft";
  const { paid, balance } = invoiceTotals(inv);
  if (balance <= 0) return "paid";
  if (inv.dueDate < asOf) return "overdue";
  if (paid > 0) return "partially_paid";
  return "sent";
}

/** Invoices that count toward Accounts Receivable. */
export function isReceivable(inv: Invoice): boolean {
  const s = invoiceStatus(inv);
  return s === "sent" || s === "partially_paid" || s === "overdue";
}

export function billTotals(bill: Bill): { total: number; paid: number; balance: number } {
  const paid = roundMoney(bill.payments.reduce((s, p) => s + p.amount, 0), bill.currency);
  return { total: bill.amount, paid, balance: roundMoney(Math.max(0, bill.amount - paid), bill.currency) };
}

export function billStatus(bill: Bill, asOf = today()): BillStatus {
  if (bill.baseStatus === "void") return "void";
  if (bill.baseStatus === "draft") return "draft";
  const { paid, balance } = billTotals(bill);
  if (balance <= 0) return "paid";
  if (bill.dueDate < asOf) return "overdue";
  if (paid > 0) return "partially_paid";
  return "open";
}

export function isPayable(bill: Bill): boolean {
  const s = billStatus(bill);
  return s === "open" || s === "partially_paid" || s === "overdue";
}

export function plannedPurchaseStatus(pp: PlannedPurchase, asOf = today()): PlannedPurchaseStatus {
  if (pp.status === "sent" && pp.validUntil < asOf) return "expired";
  return pp.status;
}

export function plannedPurchaseTotal(pp: PlannedPurchase): number {
  return documentTotals(pp.lines, pp.discount, 0, pp.currency).total;
}

/** Signed effect of a transaction on a specific account. */
export function transactionEffect(tx: Transaction, accountId: ID): number {
  if (tx.type === "income" && tx.accountId === accountId) return tx.amount;
  if (tx.type === "expense" && tx.accountId === accountId) return -tx.amount;
  if (tx.type === "transfer") {
    if (tx.accountId === accountId) return -tx.amount;
    if (tx.toAccountId === accountId) return tx.amount;
  }
  return 0;
}

export function accountBalance(account: FinancialAccount, transactions: Transaction[], asOf = today()): number {
  let bal = account.openingBalance;
  for (const tx of transactions) {
    if (tx.date > asOf) continue;
    bal += transactionEffect(tx, account.id);
  }
  return roundMoney(bal, account.currency);
}

export function totalStock(item: Item): number {
  return Object.values(item.stock).reduce((s, q) => s + q, 0);
}

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(qty: number, reorderLevel: number): StockLevel {
  if (qty <= 0) return "out";
  if (qty <= reorderLevel) return "low";
  return "ok";
}

/** Items at or below their reorder level in the given branch (or any branch if undefined). */
export function lowStockEntries(items: Item[], branchId?: ID): { item: Item; branchId: ID; qty: number }[] {
  const out: { item: Item; branchId: ID; qty: number }[] = [];
  for (const item of items) {
    if (item.status !== "active") continue;
    for (const [bId, qty] of Object.entries(item.stock)) {
      if (branchId && bId !== branchId) continue;
      if (qty <= item.reorderLevel) out.push({ item, branchId: bId, qty });
    }
  }
  return out;
}

/** Next document number in a sequence such as INV-2026-0042. */
export function nextNumber(prefix: string, existing: string[], year = today().slice(0, 4)): string {
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  let max = 0;
  for (const n of existing) {
    const m = re.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Deterministic duplicate fingerprint for statement/import rows:
 * same account, date, signed amount, and normalized description.
 */
export function duplicateKey(accountId: ID, date: string, signedAmount: number, description: string): string {
  const norm = description.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  return `${accountId}|${date}|${signedAmount.toFixed(2)}|${norm}`;
}

export function signedAmount(tx: Transaction): number {
  return tx.type === "expense" ? -tx.amount : tx.amount;
}
