import type { Currency, FinancialAccount, ID, ISODate, Transaction } from "@/types";
import { duplicateKey, transactionEffect } from "@/lib/domain";
import { roundMoney } from "@/lib/currency";
import { today } from "@/lib/date";
import { parseAmountCell, parseDateCell } from "@/features/import/lib/csv";
import { suggestCategory, type CategorySuggestion } from "../categorize";
import { NONE, type ColumnMapping, type ParsedStatement } from "./formats";

/** A statement line after mapping, before user decisions. */
export interface MappedRow {
  line: number; // 1-based line in the data section
  raw: string[];
  date?: ISODate;
  dateRaw: string;
  description: string;
  amount?: number; // signed: + money in, - money out
  amountRaw: string;
  reference?: string;
}

/** User edits/decisions per line. */
export interface RowOverride {
  date?: ISODate;
  description?: string;
  amount?: number;
  categoryId?: ID; // confirmed category
  includeDuplicate?: boolean;
  skip?: boolean;
}

export type RowState = "valid" | "error" | "duplicate" | "skipped";

export interface ReviewedRow extends MappedRow {
  errors: string[];
  duplicate?: "ledger" | "file";
  /** Ledger transaction this line duplicates. */
  duplicateOf?: ID;
  key?: string;
  suggestion?: CategorySuggestion;
  categoryId?: ID;
  state: RowState;
  /** Will be posted on commit. */
  willPost: boolean;
  fixed: boolean;
}

const cell = (p: ParsedStatement, r: string[], col: string) => {
  if (col === NONE) return "";
  const i = p.headers.indexOf(col);
  return i >= 0 ? (r[i] ?? "") : "";
};

export function mapRows(p: ParsedStatement, m: ColumnMapping): MappedRow[] {
  return p.rows.map((r, i) => {
    const dateRaw = cell(p, r, m.date);
    let amount: number | undefined;
    let amountRaw = "";
    if (m.amountMode === "split") {
      const inRaw = cell(p, r, m.moneyIn);
      const outRaw = cell(p, r, m.moneyOut);
      const a = parseAmountCell(inRaw);
      const b = parseAmountCell(outRaw);
      amountRaw = inRaw || outRaw ? `${inRaw ? `+${inRaw}` : ""}${outRaw ? `-${outRaw}` : ""}` : "";
      if (Number.isNaN(a) || Number.isNaN(b)) amount = Number.NaN;
      else if (a !== undefined || b !== undefined) amount = (a ?? 0) - Math.abs(b ?? 0);
    } else if (m.amountMode === "typed") {
      amountRaw = cell(p, r, m.amount);
      const a = parseAmountCell(amountRaw);
      const t = cell(p, r, m.type).toUpperCase();
      if (a === undefined || Number.isNaN(a)) amount = a;
      else if (/^(CR|C|CREDIT|IN)$/.test(t)) amount = Math.abs(a);
      else if (/^(DR|D|DEBIT|OUT)$/.test(t)) amount = -Math.abs(a);
      else amount = Number.NaN;
    } else {
      amountRaw = cell(p, r, m.amount);
      amount = parseAmountCell(amountRaw);
    }
    const ref = cell(p, r, m.reference);
    return {
      line: i + 1,
      raw: r,
      dateRaw,
      date: parseDateCell(dateRaw, m.dateFormat),
      description: cell(p, r, m.description),
      amount,
      amountRaw,
      reference: ref || undefined,
    };
  });
}

export interface ReviewContext {
  account: FinancialAccount;
  transactions: Transaction[];
  customers: string[];
  overrides: Record<number, RowOverride>;
}

/** Apply overrides, validation, duplicate detection and AI suggestions. Deterministic. */
export function reviewRows(mapped: MappedRow[], ctx: ReviewContext): ReviewedRow[] {
  const { account, transactions, overrides } = ctx;
  const ledger = new Map<string, ID>();
  for (const t of transactions) {
    const eff = transactionEffect(t, account.id);
    if (eff === 0) continue;
    ledger.set(duplicateKey(account.id, t.date, eff, t.description), t.id);
  }
  const seen = new Set<string>();
  return mapped.map((r) => {
    const o = overrides[r.line] ?? {};
    const date = o.date ?? r.date;
    const description = (o.description ?? r.description).trim();
    const amount = o.amount ?? r.amount;
    const fixed = o.date !== undefined || o.amount !== undefined || o.description !== undefined;
    const errors: string[] = [];
    if (!date) errors.push(r.dateRaw ? `Invalid date “${r.dateRaw}”` : "Missing date");
    else if (date > today()) errors.push("Date is in the future");
    if (amount === undefined) errors.push("Missing amount");
    else if (Number.isNaN(amount)) errors.push(`Unreadable amount “${r.amountRaw}”`);
    else if (amount === 0) errors.push("Amount is zero");
    if (!description) errors.push("Missing description");

    const valid = errors.length === 0;
    const signed = valid ? roundMoney(amount!, account.currency) : 0;
    let duplicate: ReviewedRow["duplicate"];
    let duplicateOf: ID | undefined;
    let key: string | undefined;
    if (valid) {
      key = duplicateKey(account.id, date!, signed, description);
      if (ledger.has(key)) {
        duplicate = "ledger";
        duplicateOf = ledger.get(key);
      } else if (seen.has(key)) duplicate = "file";
      seen.add(key);
    }
    const suggestion = valid ? suggestCategory(description, signed, ctx.customers) : undefined;
    const includeDup = !!o.includeDuplicate;
    let state: RowState = "valid";
    if (o.skip) state = "skipped";
    else if (!valid) state = "error";
    else if (duplicate && !includeDup) state = "duplicate";
    return {
      ...r,
      date,
      description,
      amount: valid ? signed : amount,
      errors,
      duplicate,
      duplicateOf,
      key,
      suggestion,
      categoryId: o.categoryId,
      state,
      willPost: state === "valid",
      fixed,
    };
  });
}

export function summarize(rows: ReviewedRow[], currency: Currency) {
  const post = rows.filter((r) => r.willPost);
  return {
    total: rows.length,
    toPost: post.length,
    categorized: post.filter((r) => r.categoryId).length,
    toReview: post.filter((r) => !r.categoryId).length,
    duplicates: rows.filter((r) => r.state === "duplicate").length,
    duplicatesIncluded: post.filter((r) => r.duplicate).length,
    errors: rows.filter((r) => r.state === "error").length,
    skipped: rows.filter((r) => r.state === "skipped").length,
    moneyIn: roundMoney(post.filter((r) => (r.amount ?? 0) > 0).reduce((s, r) => s + r.amount!, 0), currency),
    moneyOut: roundMoney(post.filter((r) => (r.amount ?? 0) < 0).reduce((s, r) => s - r.amount!, 0), currency),
  };
}
