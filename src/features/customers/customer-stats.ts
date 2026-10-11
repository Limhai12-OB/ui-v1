import type { Currency, ID, Invoice } from "@/types";
import { invoiceStatus, invoiceTotals, isReceivable } from "@/lib/domain";
import { roundMoney } from "@/lib/currency";
import { today } from "@/lib/date";

export interface CustomerStats {
  invoiceCount: number;
  openCount: number;
  overdueCount: number;
  outstanding: Record<Currency, number>;
  overdue: Record<Currency, number>;
  invoicedYtd: Record<Currency, number>;
  paid: Record<Currency, number>;
  lastInvoiceDate?: string;
  /** Oldest overdue due date, for "x days overdue" hints. */
  oldestOverdueDue?: string;
}

const zero = (): Record<Currency, number> => ({ USD: 0, KHR: 0 });

export function emptyStats(): CustomerStats {
  return { invoiceCount: 0, openCount: 0, overdueCount: 0, outstanding: zero(), overdue: zero(), invoicedYtd: zero(), paid: zero() };
}

/** Per-customer receivable figures derived from invoices (amounts kept per currency). */
export function customerStats(invoices: Invoice[]): Map<ID, CustomerStats> {
  const year = today().slice(0, 4);
  const map = new Map<ID, CustomerStats>();
  for (const inv of invoices) {
    const st = map.get(inv.customerId) ?? emptyStats();
    map.set(inv.customerId, st);
    const status = invoiceStatus(inv);
    if (status === "cancelled") continue;
    const t = invoiceTotals(inv);
    st.invoiceCount++;
    if (status !== "draft") {
      if (!st.lastInvoiceDate || inv.issueDate > st.lastInvoiceDate) st.lastInvoiceDate = inv.issueDate;
      if (inv.issueDate.startsWith(year)) st.invoicedYtd[inv.currency] = roundMoney(st.invoicedYtd[inv.currency] + t.total, inv.currency);
    }
    st.paid[inv.currency] = roundMoney(st.paid[inv.currency] + t.paid, inv.currency);
    if (isReceivable(inv)) {
      st.openCount++;
      st.outstanding[inv.currency] = roundMoney(st.outstanding[inv.currency] + t.balance, inv.currency);
      if (status === "overdue") {
        st.overdueCount++;
        st.overdue[inv.currency] = roundMoney(st.overdue[inv.currency] + t.balance, inv.currency);
        if (!st.oldestOverdueDue || inv.dueDate < st.oldestOverdueDue) st.oldestOverdueDue = inv.dueDate;
      }
    }
  }
  return map;
}

/** Sort key for per-currency amounts (USD first, then KHR) — used only for ordering. */
export function amountSortKey(v: Record<Currency, number>): number {
  return v.USD * 1e9 + v.KHR;
}
