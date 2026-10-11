/**
 * Functional tests for the connected demo workflows: each action must update
 * every dependent view's data (lists, balances, KPIs, stock, notifications).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./app-store";
import { useSessionStore } from "./session-store";
import { invoiceStatus, invoiceTotals, accountBalance, billStatus, lowStockEntries } from "@/lib/domain";
import { receivables, payables, periodTotals, currentPeriods } from "@/lib/analytics";
import { aggregateMoney, convert, formatMoney } from "@/lib/currency";
import { today } from "@/lib/date";

const db = () => useAppStore.getState();
const ALL = () => ({ branchIds: db().branches.map((b) => b.id) });
const USD = { display: "USD" as const, rate: 4100 };

beforeEach(() => {
  db().resetDemoData();
  useSessionStore.setState({ status: "signed_in", userId: "user_owner" });
});

describe("currency rules", () => {
  it("never converts without a configured rate", () => {
    expect(convert(100, "USD", "KHR", null)).toBeNull();
    const agg = aggregateMoney([{ amount: 10, currency: "USD" }, { amount: 41000, currency: "KHR" }], "USD", null);
    expect(agg.total).toBeNull();
    expect(agg.byCurrency).toEqual({ USD: 10, KHR: 41000 });
  });
  it("labels converted totals", () => {
    const agg = aggregateMoney([{ amount: 10, currency: "USD" }, { amount: 41000, currency: "KHR" }], "USD", 4100);
    expect(agg.total).toBe(20);
    expect(agg.converted).toBe(true);
  });
  it("formats USD with cents and KHR as whole riel", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(4100000, "KHR")).toBe("៛4,100,000");
    expect(formatMoney(-20, "USD")).toBe("−$20.00");
  });
});

describe("seed data", () => {
  it("is deterministic", () => {
    const a = JSON.stringify(db().transactions.slice(0, 50).map((t) => [t.date, t.amount, t.description]));
    db().resetDemoData();
    const b = JSON.stringify(db().transactions.slice(0, 50).map((t) => [t.date, t.amount, t.description]));
    expect(a).toBe(b);
  });
  it("has no negative stock and includes low-stock cases", () => {
    for (const item of db().items) for (const q of Object.values(item.stock)) expect(q).toBeGreaterThanOrEqual(0);
    expect(lowStockEntries(db().items).length).toBeGreaterThan(0);
  });
});

describe("Create invoice → list, customer, AR, stock", () => {
  it("sending an invoice adds receivables and deducts stock", () => {
    const item = db().items.find((i) => i.sku === "BEV-003")!;
    const before = item.stock.br_main;
    const arBefore = receivables(db().invoices, ALL(), USD).total.value;
    const inv = db().createInvoice({
      customerId: "cus_riverside",
      branchId: "br_main",
      issueDate: today(),
      dueDate: "2026-10-26",
      currency: "USD",
      lines: [{ id: "l1", itemId: item.id, description: item.name, quantity: 5, unitPrice: 2.4 }],
      discount: 0,
      taxRate: 10,
      send: true,
    });
    expect(invoiceStatus(inv)).toBe("sent");
    expect(invoiceTotals(inv).total).toBe(13.2);
    expect(db().items.find((i) => i.id === item.id)!.stock.br_main).toBe(before - 5);
    expect(db().stockMovements.some((m) => m.reference === inv.number && m.quantityChange === -5)).toBe(true);
    expect(receivables(db().invoices, ALL(), USD).total.value).toBeCloseTo(arBefore + 13.2, 2);
    expect(db().invoices.filter((i) => i.customerId === "cus_riverside").map((i) => i.id)).toContain(inv.id);
  });
});

describe("Record invoice payment → balance, history, transactions, dashboard", () => {
  it("partial then full payment updates status, transactions and revenue", () => {
    const inv = db().invoices.find((i) => invoiceStatus(i) === "overdue")!;
    const { balance } = invoiceTotals(inv);
    const revBefore = periodTotals(db().transactions, currentPeriods().start, today(), ALL(), USD).revenue.value;
    db().recordInvoicePayment(inv.id, { date: today(), amount: 50, method: "bank_transfer", accountId: "acc_aba_usd" });
    let fresh = db().invoices.find((i) => i.id === inv.id)!;
    expect(invoiceTotals(fresh).balance).toBeCloseTo(balance - 50, 2);
    const tx = db().transactions.find((t) => t.id === fresh.payments.at(-1)!.transactionId)!;
    expect(tx).toMatchObject({ type: "income", amount: 50, source: "invoice_payment", sourceId: inv.id });
    db().recordInvoicePayment(inv.id, { date: today(), amount: 999999, method: "cash", accountId: "acc_cash_main" });
    fresh = db().invoices.find((i) => i.id === inv.id)!;
    expect(invoiceStatus(fresh)).toBe("paid");
    const revAfter = periodTotals(db().transactions, currentPeriods().start, today(), ALL(), USD).revenue.value;
    expect(revAfter).toBeCloseTo(revBefore + balance, 2);
  });
});

describe("Create item sale → sales history, stock, revenue", () => {
  it("records sale, transaction, movement and low-stock notification", () => {
    const item = db().items.find((i) => i.sku === "COF-001")!; // already low in Toul Kork
    const qty = item.stock.br_tk;
    const sale = db().createSale({
      date: today(),
      branchId: "br_tk",
      channel: "walk_in",
      lines: [{ id: "l1", itemId: item.id, description: item.name, quantity: 1, unitPrice: item.sellingPrice }],
      currency: "USD",
      discount: 0,
      paymentMethod: "cash",
      accountId: "acc_cash_tk",
    });
    expect(db().sales.at(-1)!.id).toBe(sale.id);
    expect(db().items.find((i) => i.id === item.id)!.stock.br_tk).toBe(qty - 1);
    expect(db().transactions.find((t) => t.id === sale.transactionId)).toMatchObject({ amount: item.sellingPrice, source: "walk_in_sale" });
    expect(db().notifications.some((n) => n.key === `lowstock:${item.id}:br_tk` && !n.read)).toBe(true);
  });
});

describe("Create bill → bills list, AP, alerts", () => {
  it("adds payables and becomes due-soon", () => {
    const apBefore = payables(db().bills, ALL(), USD);
    const bill = db().createBill({ supplier: "Test Supplier", branchId: "br_main", categoryId: "cat_supplies", issueDate: today(), dueDate: "2026-10-18", currency: "USD", amount: 300, description: "Test" });
    expect(billStatus(bill)).toBe("open");
    const ap = payables(db().bills, ALL(), USD);
    expect(ap.total.value).toBeCloseTo(apBefore.total.value + 300, 2);
    expect(ap.dueSoonCount).toBe(apBefore.dueSoonCount + 1);
    db().recordBillPayment(bill.id, { date: today(), amount: 300, method: "bank_transfer", accountId: "acc_aba_usd" });
    expect(billStatus(db().bills.find((b) => b.id === bill.id)!)).toBe("paid");
  });
});

describe("Stock adjustment → movement history, stock, notifications", () => {
  it("distinguishes increase, decrease and correction", () => {
    const id = "itm_bev003";
    const start = db().items.find((i) => i.id === id)!.stock.br_sr;
    db().createStockAdjustment({ itemId: id, branchId: "br_sr", date: today(), type: "increase", quantity: 10, reason: "Received" });
    db().createStockAdjustment({ itemId: id, branchId: "br_sr", date: today(), type: "decrease", quantity: 4, reason: "Damaged" });
    expect(db().items.find((i) => i.id === id)!.stock.br_sr).toBe(start + 6);
    db().createStockAdjustment({ itemId: id, branchId: "br_sr", date: today(), type: "correction", quantity: 2, reason: "Count" });
    expect(db().items.find((i) => i.id === id)!.stock.br_sr).toBe(2);
    const last = db().stockMovements.at(-1)!;
    expect(last).toMatchObject({ type: "correction", quantityChange: 2 - (start + 6), resultingQuantity: 2 });
    expect(db().notifications.some((n) => n.key === `lowstock:${id}:br_sr`)).toBe(true);
  });
});

describe("Import bank statement → review, account transactions", () => {
  it("posts categorized rows, routes uncategorized to review, and resolves the batch", () => {
    const acc = db().accounts.find((a) => a.id === "acc_wing_usd")!;
    const balBefore = accountBalance(acc, db().transactions);
    const batch = db().createImportBatch({ kind: "bank_statement", fileName: "t.csv", fileSize: 1, accountId: acc.id, branchId: acc.branchId, status: "processing", totalRows: 2, importedRows: 0, duplicateRows: 0, errorRows: 0, reviewRows: 0 });
    const ids = db().commitStatementRows(batch.id, acc.id, [
      { date: today(), description: "WING SETTLEMENT", amount: 120, categoryId: "cat_sales" },
      { date: today(), description: "UNKNOWN TRF", amount: -20, suggestedCategoryId: "cat_supplies", suggestionConfidence: 0.6 },
    ]);
    expect(ids).toHaveLength(2);
    expect(db().imports.find((b) => b.id === batch.id)!.status).toBe("needs_review");
    expect(accountBalance(acc, db().transactions)).toBeCloseTo(balBefore + 100, 2);
    db().categorizeTransactions([ids[1]]);
    expect(db().transactions.find((t) => t.id === ids[1])).toMatchObject({ status: "posted", categoryId: "cat_supplies" });
    expect(db().imports.find((b) => b.id === batch.id)!.status).toBe("completed");
  });
});

describe("Reconciliation sign-off", () => {
  it("marks matched transactions reconciled and updates the monthly report", () => {
    const rec = db().reconciliations.find((r) => r.id === "rec_003")!;
    db().signOffReconciliation(rec.id, "ok");
    const matchedIds = rec.lines.map((l) => l.transactionId);
    expect(db().transactions.filter((t) => matchedIds.includes(t.id)).every((t) => t.reconciled)).toBe(true);
    const rep = db().reports.find((r) => r.month === "2026-09")!;
    expect(rep.missing.some((m) => m.startsWith("ACLEDA"))).toBe(false);
  });
});
