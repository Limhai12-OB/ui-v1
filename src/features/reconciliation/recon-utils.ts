import type { FinancialAccount, ID, ISODate, Reconciliation, ReconLine, ReconLineState, Transaction } from "@/types";
import { accountBalance, transactionEffect } from "@/lib/domain";
import { formatMoney, roundMoney } from "@/lib/currency";
import { addDaysISO, daysBetween, monthKey, monthRange, previousMonth, today } from "@/lib/date";

export const LINE_STATES: ReconLineState[] = ["matched", "suggested", "unmatched", "discrepancy"];

export const RECON_STEPS = [
  { id: "lines", label: "Statement lines" },
  { id: "match", label: "Match" },
  { id: "review", label: "Review" },
  { id: "submit", label: "Submit" },
  { id: "signoff", label: "Owner sign-off" },
];

/** Accounts that receive bank statements. */
export function isReconcilable(a: FinancialAccount): boolean {
  return (a.type === "bank" || a.type === "ewallet") && a.status === "active";
}

export function isEditable(r: Reconciliation): boolean {
  return r.status === "in_progress" || r.status === "returned";
}

/**
 * A line is resolved when it is matched, or when it is unmatched but was
 * explicitly reviewed with a note (e.g. a bank-only item explained to the owner).
 * Suggested and discrepancy lines always need a decision.
 */
export function isResolved(l: ReconLine): boolean {
  if (l.state === "matched") return true;
  if (l.state === "unmatched") return !!l.note?.trim();
  return false;
}

export function lineCounts(lines: ReconLine[]): Record<ReconLineState, number> {
  const c: Record<ReconLineState, number> = { matched: 0, suggested: 0, unmatched: 0, discrepancy: 0 };
  for (const l of lines) c[l.state]++;
  return c;
}

export function pendingLines(lines: ReconLine[]): ReconLine[] {
  return lines.filter((l) => !isResolved(l));
}

/** Current step index for `Steps` derived from status and line states. */
export function currentStep(r: Reconciliation): number {
  if (r.status === "signed_off") return RECON_STEPS.length;
  if (r.status === "submitted") return 4;
  if (r.lines.length === 0) return 0;
  return pendingLines(r.lines).length > 0 ? 1 : 3;
}

export interface ReconSummary {
  opening: number;
  closing: number;
  /** True when opening/closing were derived from the ledger (seeded records without statement balances). */
  derived: boolean;
  statementTotal: number;
  matchedStatementTotal: number;
  matchedLedgerTotal: number;
  /** Statement lines total − matched ledger total. */
  difference: number;
  /** Portion of the difference on matched lines whose amounts differ (accepted with a note). */
  explainedDifference: number;
  ledgerClosing: number;
  matchedPct: number;
}

export function reconSummary(r: Reconciliation, account: FinancialAccount, transactions: Transaction[]): ReconSummary {
  const cur = account.currency;
  const byId = new Map(transactions.map((t) => [t.id, t]));
  let statementTotal = 0;
  let matchedStatementTotal = 0;
  let matchedLedgerTotal = 0;
  for (const l of r.lines) {
    statementTotal += l.amount;
    if (l.state === "matched" && l.transactionId) {
      const tx = byId.get(l.transactionId);
      matchedStatementTotal += l.amount;
      if (tx) matchedLedgerTotal += transactionEffect(tx, account.id);
    }
  }
  const ledgerClosing = accountBalance(account, transactions, r.periodEnd);
  const derived = r.statementOpening === 0 && r.statementClosing === 0;
  const opening = derived ? accountBalance(account, transactions, addDaysISO(r.periodStart, -1)) : r.statementOpening;
  const closing = derived ? (r.lines.length ? roundMoney(opening + statementTotal, cur) : ledgerClosing) : r.statementClosing;
  const matched = r.lines.filter((l) => l.state === "matched").length;
  return {
    opening,
    closing,
    derived,
    statementTotal: roundMoney(statementTotal, cur),
    matchedStatementTotal: roundMoney(matchedStatementTotal, cur),
    matchedLedgerTotal: roundMoney(matchedLedgerTotal, cur),
    difference: roundMoney(statementTotal - matchedLedgerTotal, cur),
    explainedDifference: roundMoney(matchedStatementTotal - matchedLedgerTotal, cur),
    ledgerClosing,
    matchedPct: r.lines.length ? matched / r.lines.length : r.status === "signed_off" ? 1 : 0,
  };
}

export interface Candidate {
  tx: Transaction;
  effect: number;
  exact: boolean;
  dayGap: number;
}

/** Ledger transactions that could match an unmatched statement line. */
export function matchCandidates(line: ReconLine, r: Reconciliation, transactions: Transaction[]): Candidate[] {
  const used = new Set(r.lines.filter((l) => l.id !== line.id && l.transactionId).map((l) => l.transactionId));
  const out: Candidate[] = [];
  for (const tx of transactions) {
    if (used.has(tx.id)) continue;
    const effect = transactionEffect(tx, r.accountId);
    if (effect === 0 || Math.sign(effect) !== Math.sign(line.amount)) continue;
    const dayGap = Math.abs(daysBetween(line.date, tx.date));
    if (dayGap > 3) continue;
    const exact = Math.abs(effect - line.amount) < 0.005;
    if (!exact && Math.abs(effect - line.amount) > Math.abs(line.amount) * 0.05) continue;
    out.push({ tx, effect, exact, dayGap });
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact) || Math.abs(a.effect - line.amount) - Math.abs(b.effect - line.amount) || a.dayGap - b.dayGap).slice(0, 8);
}

/* ---------------- Simulated statement import ---------------- */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function statementDescription(s: string): string {
  return s.toUpperCase().replace(/\s+/g, " ").trim().slice(0, 40);
}

/** The last ~6 months up to the current business month. */
export function recentMonths(count = 6): string[] {
  const out: string[] = [];
  let m = monthKey(today());
  for (let i = 0; i < count; i++) {
    out.push(m);
    m = previousMonth(m);
  }
  return out;
}

export function periodFor(month: string): { start: ISODate; end: ISODate; partial: boolean } {
  const { start, end } = monthRange(month);
  const t = today();
  return end > t ? { start, end: t, partial: true } : { start, end, partial: false };
}

export interface StatementPreview {
  periodStart: ISODate;
  periodEnd: ISODate;
  partial: boolean;
  lines: ReconLine[];
  opening: number;
  closing: number;
}

/**
 * Builds simulated "imported" statement lines for an account and month from
 * its ledger, deterministically perturbed (seeded by account + month) so the
 * matching workflow has suggestions, a fee discrepancy and bank-only items.
 */
export function buildStatement(account: FinancialAccount, transactions: Transaction[], month: string): StatementPreview {
  const { start, end, partial } = periodFor(month);
  const cur = account.currency;
  const opening = accountBalance(account, transactions, addDaysISO(start, -1));
  const relevant = transactions
    .filter((t) => t.date >= start && t.date <= end && transactionEffect(t, account.id) !== 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (relevant.length === 0) return { periodStart: start, periodEnd: end, partial, lines: [], opening, closing: opening };

  const seed = hashString(`${account.id}:${month}`);
  const rand = rng(seed);
  const offset = seed % 9;
  const prefix = `rl_${seed.toString(36)}`;
  let discrepancyAt = Math.floor(rand() * relevant.length);
  if (relevant.length > 1 && discrepancyAt % 9 === offset) discrepancyAt = (discrepancyAt + 1) % relevant.length;
  const fee = cur === "USD" ? 0.5 : 2000;

  const lines: ReconLine[] = relevant.map((t, i) => {
    const amount = transactionEffect(t, account.id);
    const base: ReconLine = { id: `${prefix}_${i}`, date: t.date, description: statementDescription(t.description), amount, reference: t.reference, state: "matched", transactionId: t.id, matchConfidence: 1 };
    if (i === discrepancyAt) {
      return { ...base, state: "discrepancy", amount: roundMoney(amount - fee, cur), note: `Statement amount differs from the ledger by ${formatMoney(-fee, cur)} (likely a bank or QR settlement fee).` };
    }
    if (i % 9 === offset) return { ...base, state: "suggested", matchConfidence: Math.round((0.7 + rand() * 0.23) * 100) / 100 };
    return base;
  });

  const md = end.slice(5).replace("-", "");
  const charge = cur === "USD" ? roundMoney(2 + rand() * 4, cur) : Math.round((8000 + rand() * 12000) / 100) * 100;
  lines.push({ id: `${prefix}_sc`, date: end, description: "MONTHLY SERVICE CHARGE", amount: -charge, reference: `SC${md}`, state: "unmatched" });
  if (rand() > 0.35) {
    const interest = cur === "USD" ? roundMoney(1 + rand() * 14, cur) : Math.round((4000 + rand() * 36000) / 100) * 100;
    lines.push({ id: `${prefix}_int`, date: end, description: "INTEREST CREDIT", amount: interest, reference: `INT${md}`, state: "unmatched" });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { periodStart: start, periodEnd: end, partial, lines, opening, closing: roundMoney(opening + total, cur) };
}

/** Best-guess category for creating a ledger entry from a bank-only line. */
export function guessCategory(line: ReconLine): ID | undefined {
  const d = line.description.toUpperCase();
  if (line.amount < 0 && /(CHARGE|FEE|COMMISSION)/.test(d)) return "cat_fees";
  if (line.amount > 0 && /(INTEREST|REBATE|REFUND)/.test(d)) return "cat_other_income";
  return undefined;
}
