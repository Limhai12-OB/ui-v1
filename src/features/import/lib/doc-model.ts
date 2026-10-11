/**
 * Document import model shared by every kind handled by DocumentImportWizard.
 * Single documents (receipt, supplier bill, payment screenshot) have a field
 * form; tabular documents (item catalog, spreadsheet) have rows.
 * All checks are deterministic so repeated runs produce the same result.
 */
import type { Bill, Currency, FinancialAccount, ID, Invoice, Item, Transaction, Customer } from "@/types";
import { duplicateKey, invoiceTotals, isReceivable, transactionEffect } from "@/lib/domain";
import { today } from "@/lib/date";
import { norm, parseAmountCell, parseDateCell, type DateFormat } from "./csv";
import { suggestCategory, suggestItemCategory } from "@/features/banking/categorize";

export type SingleKind = "receipt" | "supplier_bill" | "payment_screenshot";
export type TableKind = "item_catalog" | "spreadsheet";
export type DocKind = SingleKind | TableKind;

export const isTableKind = (k: DocKind): k is TableKind => k === "item_catalog" || k === "spreadsheet";

export const DOC_KINDS: DocKind[] = ["receipt", "supplier_bill", "payment_screenshot", "item_catalog", "spreadsheet"];

export const KIND_META: Record<DocKind, { title: string; short: string; description: string; accept: string; acceptLabel: string; creates: string }> = {
  receipt: { title: "Receipt", short: "receipt", description: "Fuel, supplies or other purchase receipts become expense transactions.", accept: "image/*,.pdf", acceptLabel: "JPG, PNG or PDF", creates: "an expense transaction" },
  supplier_bill: { title: "Supplier bill", short: "bill", description: "Supplier invoices and utility bills become bills to pay.", accept: "image/*,.pdf", acceptLabel: "JPG, PNG or PDF", creates: "a bill" },
  payment_screenshot: { title: "Payment screenshot", short: "payment", description: "ABA, Wing or ACLEDA confirmations are matched to open invoices.", accept: "image/*", acceptLabel: "JPG or PNG", creates: "an invoice payment or income transaction" },
  item_catalog: { title: "Item catalog", short: "catalog", description: "Supplier price lists add new items; existing SKUs are skipped.", accept: ".csv,.xlsx,.xls", acceptLabel: "CSV or Excel", creates: "new inventory items" },
  spreadsheet: { title: "Spreadsheet", short: "spreadsheet", description: "CSV or Excel lists of income and expenses become transactions.", accept: ".csv,.xlsx,.xls", acceptLabel: "CSV or Excel", creates: "transactions" },
};

/* ------------------------------------------------------------------ */
/* Single-document fields                                              */
/* ------------------------------------------------------------------ */

export type FieldType = "text" | "date" | "money" | "currency" | "expenseCategory" | "incomeCategory" | "account" | "branch";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  helper?: string;
}

export const FIELDS: Record<SingleKind, FieldDef[]> = {
  receipt: [
    { key: "merchant", label: "Merchant", type: "text", required: true },
    { key: "date", label: "Receipt date", type: "date", required: true },
    { key: "receiptNo", label: "Receipt no.", type: "text", required: false },
    { key: "currency", label: "Currency", type: "currency", required: true },
    { key: "amount", label: "Total paid", type: "money", required: true },
    { key: "categoryId", label: "Expense category", type: "expenseCategory", required: true },
    { key: "accountId", label: "Paid from account", type: "account", required: true, helper: "Must hold the receipt's currency." },
    { key: "description", label: "Description", type: "text", required: true },
  ],
  supplier_bill: [
    { key: "supplier", label: "Supplier", type: "text", required: true },
    { key: "billNo", label: "Supplier invoice no.", type: "text", required: false },
    { key: "issueDate", label: "Bill date", type: "date", required: true },
    { key: "dueDate", label: "Due date", type: "date", required: true },
    { key: "currency", label: "Currency", type: "currency", required: true },
    { key: "amount", label: "Amount due", type: "money", required: true },
    { key: "categoryId", label: "Expense category", type: "expenseCategory", required: true },
    { key: "branchId", label: "Branch", type: "branch", required: true },
    { key: "description", label: "Description", type: "text", required: true },
  ],
  payment_screenshot: [
    { key: "payer", label: "Payer", type: "text", required: true },
    { key: "date", label: "Payment date", type: "date", required: true },
    { key: "reference", label: "Transaction ID", type: "text", required: true, helper: "Used to detect duplicate uploads." },
    { key: "currency", label: "Currency", type: "currency", required: true },
    { key: "amount", label: "Amount received", type: "money", required: true },
    { key: "accountId", label: "Received into account", type: "account", required: true },
    { key: "note", label: "Remark", type: "text", required: false },
  ],
};

export type Origin = "extracted" | "ai" | "user" | "empty";

export interface FieldValue {
  value: string;
  origin: Origin;
  confidence?: number;
  /** User ticked "confirm" on an extracted/AI value. */
  confirmed?: boolean;
}

export type Fields = Record<string, FieldValue>;

export interface FieldSuggestion {
  key: string;
  value: string;
  /** Display label when the value is an id (category, account, branch). */
  label?: string;
  reason: string;
  confidence: number;
}

export type ValueState = "extracted" | "ai" | "confirmed" | "error" | "duplicate";

export function valueState(f: FieldValue | undefined, error: boolean, duplicate: boolean): ValueState {
  if (error) return "error";
  if (duplicate) return "duplicate";
  if (!f || f.origin === "user" || f.confirmed) return "confirmed";
  return f.origin === "ai" ? "ai" : "extracted";
}

export interface Ctx {
  accounts: FinancialAccount[];
  transactions: Transaction[];
  bills: Bill[];
  invoices: Invoice[];
  customers: Customer[];
  items: Item[];
  inScope: (branchId?: ID) => boolean;
}

export interface Duplicate {
  label: string;
  href: string;
}

export function num(v: string | undefined): number | undefined {
  const n = parseAmountCell(v);
  return n === undefined || Number.isNaN(n) ? undefined : n;
}

/** Deterministic duplicate check for single documents. */
export function findSingleDuplicate(kind: SingleKind, f: Record<string, string>, ctx: Ctx): Duplicate | undefined {
  const amount = num(f.amount);
  if (kind === "supplier_bill") {
    if (!f.supplier || amount === undefined) return;
    const b = ctx.bills.find((x) => x.baseStatus !== "void" && norm(x.supplier) === norm(f.supplier) && x.amount === amount && x.currency === f.currency && x.issueDate.slice(0, 7) === (f.issueDate ?? "").slice(0, 7));
    return b ? { label: `${b.number} – ${b.supplier}`, href: `/bills/${b.id}` } : undefined;
  }
  if (kind === "payment_screenshot") {
    if (!f.reference) return;
    const t = ctx.transactions.find((x) => x.reference && norm(x.reference) === norm(f.reference));
    return t ? { label: `${t.description} (${t.reference})`, href: `/transactions/${t.id}` } : undefined;
  }
  // receipt: same date, amount and currency with the merchant named in the description/counterparty
  if (!f.date || amount === undefined || !f.merchant) return;
  const token = norm(f.merchant.split(/\s+/)[0] ?? "");
  const t = ctx.transactions.find(
    (x) => x.type === "expense" && x.date === f.date && x.amount === amount && x.currency === f.currency && token.length >= 3 && (norm(x.counterparty ?? "").includes(token) || norm(x.description).includes(token)),
  );
  return t ? { label: `${t.description} on ${t.date}`, href: `/transactions/${t.id}` } : undefined;
}

export interface InvoiceMatch {
  invoice: Invoice;
  customerName: string;
  balance: number;
  confidence: number;
  reason: string;
}

/** Match a payment to an open invoice by exact balance, preferring the named customer. */
export function matchInvoice(f: Record<string, string>, ctx: Ctx): InvoiceMatch | undefined {
  const amount = num(f.amount);
  if (amount === undefined) return;
  const open = ctx.invoices.filter((i) => isReceivable(i) && i.currency === f.currency && ctx.inScope(i.branchId) && invoiceTotals(i).balance === amount);
  const name = norm(f.payer ?? "");
  const scored = open.map((inv) => {
    const cust = ctx.customers.find((c) => c.id === inv.customerId);
    const cn = norm(cust?.name ?? "");
    const named = name.length > 3 && (cn.includes(name) || name.includes(cn));
    return { invoice: inv, customerName: cust?.name ?? "Customer", balance: invoiceTotals(inv).balance, confidence: named ? 0.96 : 0.62, reason: named ? "Exact balance and customer name match" : "Exact balance match; payer name differs" };
  });
  scored.sort((a, b) => b.confidence - a.confidence || a.invoice.number.localeCompare(b.invoice.number));
  return scored[0];
}

export interface SingleCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export function fieldErrors(kind: SingleKind, f: Record<string, string>, ctx: Ctx): Record<string, string> {
  const e: Record<string, string> = {};
  for (const d of FIELDS[kind]) if (d.required && !f[d.key]?.trim()) e[d.key] = `${d.label} is required`;
  const amount = num(f.amount);
  if (f.amount && amount === undefined) e.amount = "Enter a valid number";
  else if (amount !== undefined && amount <= 0) e.amount = "Amount must be greater than zero";
  else if (amount !== undefined && f.currency === "KHR" && !Number.isInteger(amount)) e.amount = "KHR amounts must be whole riel";
  for (const k of ["date", "issueDate"]) if (f[k] && !/^\d{4}-\d{2}-\d{2}$/.test(f[k])) e[k] = "Enter a valid date";
  if (f.date && f.date > today()) e.date = "Date can't be in the future";
  if (f.issueDate && f.issueDate > today()) e.issueDate = "Bill date can't be in the future";
  if (f.dueDate && f.issueDate && f.dueDate < f.issueDate) e.dueDate = "Due date can't be before the bill date";
  if (f.accountId) {
    const a = ctx.accounts.find((x) => x.id === f.accountId);
    if (!a) e.accountId = "Choose an account";
    else if (f.currency && a.currency !== f.currency) e.accountId = `${a.name} holds ${a.currency}; the document is in ${f.currency}`;
  }
  return e;
}

/* ------------------------------------------------------------------ */
/* Tabular documents                                                   */
/* ------------------------------------------------------------------ */

export interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
  /** Header names recognised during auto-mapping. */
  match: RegExp;
  align?: "right";
}

export const TABLE_COLUMNS: Record<TableKind, ColumnDef[]> = {
  item_catalog: [
    { key: "sku", label: "SKU", required: true, match: /^sku|item code|code/i },
    { key: "name", label: "Product name", required: true, match: /name|product|description/i },
    { key: "unit", label: "Unit", required: true, match: /unit|uom/i },
    { key: "cost", label: "Cost price", required: true, match: /cost/i, align: "right" },
    { key: "price", label: "Selling price", required: true, match: /sell|retail|price/i, align: "right" },
    { key: "reorder", label: "Reorder level", required: false, match: /reorder|min/i, align: "right" },
  ],
  spreadsheet: [
    { key: "date", label: "Date", required: true, match: /date/i },
    { key: "description", label: "Description", required: true, match: /desc|detail|item|memo/i },
    { key: "type", label: "Type", required: true, match: /type|in\/out|direction/i },
    { key: "amount", label: "Amount", required: true, match: /amount|total|value/i, align: "right" },
  ],
};

export interface TableRowInput {
  line: number;
  cells: Record<string, string>;
  /** Per-cell origin; AI-filled category lives in `category`. */
  edited: Record<string, boolean>;
  category?: { value: ID; origin: "ai" | "user"; confidence?: number };
  skip?: boolean;
  includeDuplicate?: boolean;
}

export interface TableRowReview extends TableRowInput {
  errors: Record<string, string>;
  warnings: string[];
  duplicate?: Duplicate & { kind: "existing" | "file" };
  state: "valid" | "error" | "duplicate" | "skipped";
  /** Parsed values for posting. */
  parsed: { date?: string; amount?: number; signed?: number; cost?: number; price?: number; reorder?: number };
}

export function mapHeaders(kind: TableKind, headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const used = new Set<number>();
  for (const c of TABLE_COLUMNS[kind]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && c.match.test(h));
    if (idx >= 0) {
      out[c.key] = idx;
      used.add(idx);
    }
  }
  return out;
}

export function buildTableRows(kind: TableKind, headers: string[], rows: string[][], customers: string[]): TableRowInput[] {
  const map = mapHeaders(kind, headers);
  return rows.map((r, i) => {
    const cells: Record<string, string> = {};
    for (const c of TABLE_COLUMNS[kind]) cells[c.key] = map[c.key] !== undefined ? (r[map[c.key]] ?? "").trim() : "";
    const row: TableRowInput = { line: i + 1, cells, edited: {} };
    row.category = aiCategory(kind, cells, customers);
    return row;
  });
}

export function aiCategory(kind: TableKind, cells: Record<string, string>, customers: string[]): TableRowInput["category"] {
  if (kind === "item_catalog") {
    const s = suggestItemCategory(cells.name ?? "");
    return s ? { value: s.categoryId, origin: "ai", confidence: s.confidence } : undefined;
  }
  const amount = num(cells.amount);
  if (amount === undefined) return undefined;
  const signed = /^(in|income|cr|credit|receipt)/i.test(cells.type ?? "") ? amount : -amount;
  const s = suggestCategory(cells.description ?? "", signed, customers);
  return s ? { value: s.categoryId, origin: "ai", confidence: s.confidence } : undefined;
}

export function reviewTable(kind: TableKind, rows: TableRowInput[], ctx: Ctx & { account?: FinancialAccount; currency: Currency; dateFormat: DateFormat }): TableRowReview[] {
  const seen = new Map<string, number>();
  const existingSkus = new Map(ctx.items.map((i) => [i.sku.toLowerCase(), i]));
  const ledger = new Map<string, Transaction>();
  if (ctx.account) for (const t of ctx.transactions) {
    const eff = transactionEffect(t, ctx.account.id);
    if (eff !== 0) ledger.set(duplicateKey(ctx.account.id, t.date, eff, t.description), t);
  }
  return rows.map((r) => {
    const c = r.cells;
    const errors: Record<string, string> = {};
    const warnings: string[] = [];
    for (const col of TABLE_COLUMNS[kind]) if (col.required && !c[col.key]?.trim()) errors[col.key] = "Required";
    const parsed: TableRowReview["parsed"] = {};
    let key: string | undefined;
    let duplicate: TableRowReview["duplicate"];
    if (kind === "item_catalog") {
      parsed.cost = num(c.cost);
      parsed.price = num(c.price);
      parsed.reorder = c.reorder ? num(c.reorder) : 0;
      if (c.cost && (parsed.cost === undefined || parsed.cost < 0)) errors.cost = "Invalid";
      if (c.price && (parsed.price === undefined || parsed.price <= 0)) errors.price = "Invalid";
      if (c.reorder && (parsed.reorder === undefined || !Number.isInteger(parsed.reorder) || parsed.reorder < 0)) errors.reorder = "Whole number";
      if (ctx.currency === "KHR" && ((parsed.cost !== undefined && !Number.isInteger(parsed.cost)) || (parsed.price !== undefined && !Number.isInteger(parsed.price)))) errors.price = "Whole riel";
      if (parsed.cost !== undefined && parsed.price !== undefined && parsed.price < parsed.cost) warnings.push("Selling price is below cost");
      if (!r.category) errors.category = "Choose a category";
      if (c.sku) {
        key = c.sku.trim().toLowerCase();
        const ex = existingSkus.get(key);
        if (ex) duplicate = { kind: "existing", label: `${ex.sku} – ${ex.name}`, href: `/items/${ex.id}` };
      }
    } else {
      parsed.date = parseDateCell(c.date, ctx.dateFormat);
      parsed.amount = num(c.amount);
      if (c.date && !parsed.date) errors.date = "Unreadable date";
      else if (parsed.date && parsed.date > today()) errors.date = "In the future";
      if (c.amount && (parsed.amount === undefined || parsed.amount <= 0)) errors.amount = "Invalid";
      else if (parsed.amount !== undefined && ctx.currency === "KHR" && !Number.isInteger(parsed.amount)) errors.amount = "Whole riel";
      const t = (c.type ?? "").toLowerCase();
      const dir = /^(in|income|cr|credit|receipt)/.test(t) ? 1 : /^(out|expense|dr|debit|payment|spend)/.test(t) ? -1 : 0;
      if (c.type && !dir) errors.type = "Use Income or Expense";
      if (parsed.amount !== undefined && dir) parsed.signed = dir * parsed.amount;
      if (ctx.account && parsed.date && parsed.signed !== undefined && c.description) {
        key = duplicateKey(ctx.account.id, parsed.date, parsed.signed, c.description);
        const ex = ledger.get(key);
        if (ex) duplicate = { kind: "existing", label: `${ex.description} on ${ex.date}`, href: `/transactions/${ex.id}` };
      }
    }
    if (key && !duplicate && seen.has(key)) duplicate = { kind: "file", label: `Repeats line ${seen.get(key)}`, href: "" };
    if (key && !seen.has(key)) seen.set(key, r.line);
    const hasErr = Object.keys(errors).length > 0;
    // Duplicate SKUs are always skipped; duplicate transactions may be included deliberately.
    const canInclude = kind === "spreadsheet";
    const state: TableRowReview["state"] = r.skip ? "skipped" : hasErr ? "error" : duplicate && !(canInclude && r.includeDuplicate) ? "duplicate" : "valid";
    return { ...r, errors, warnings, duplicate, state, parsed };
  });
}

