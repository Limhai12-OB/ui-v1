import type { Currency, FinancialAccount, ID, ISODate, TillDenomination, TillSession, Transaction } from "@/types";
import { roundMoney } from "@/lib/currency";

export const USD_NOTES = [100, 50, 20, 10, 5, 1] as const;
export const KHR_NOTES = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 100] as const;
/** Stored as a USD denomination with value 0.01 and count = cents. */
export const USD_COIN_VALUE = 0.01;

/** Differences above these need an explanation before submitting. */
export const VARIANCE_THRESHOLD: Record<Currency, number> = { USD: 2, KHR: 8_000 };

export type TillShift = TillSession["shift"];
export const SHIFT_LABEL: Record<TillShift, string> = { morning: "Morning", evening: "Evening", full_day: "Full day" };
export const SHIFT_OPTIONS: { value: TillShift; label: string }[] = [
  { value: "full_day", label: "Full day" },
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
];

export const TILL_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Awaiting sign-off" },
  { value: "returned", label: "Returned" },
  { value: "signed_off", label: "Signed off" },
];

export type VarianceKind = "over" | "short" | "balanced";

export function varianceKind(diff: number, currency: Currency): VarianceKind {
  const d = roundMoney(diff, currency);
  if (d > 0) return "over";
  if (d < 0) return "short";
  return "balanced";
}

export function exceedsThreshold(diff: number, currency: Currency): boolean {
  return Math.abs(roundMoney(diff, currency)) > VARIANCE_THRESHOLD[currency];
}

export function tillDiff(s: Pick<TillSession, "countedUSD" | "countedKHR" | "expectedUSD" | "expectedKHR">, currency: Currency): number {
  return currency === "USD" ? roundMoney(s.countedUSD - s.expectedUSD, "USD") : roundMoney(s.countedKHR - s.expectedKHR, "KHR");
}

export function noteLabel(value: number, currency: Currency): string {
  if (currency === "USD") return value === USD_COIN_VALUE ? "Coins & cents" : `$${value} note`;
  return `៛${value.toLocaleString("en-US")} note`;
}

export interface ExpectedCash {
  usdAccounts: FinancialAccount[];
  khrAccounts: FinancialAccount[];
  usdTx: Transaction[];
  khrTx: Transaction[];
  cashInUSD: number;
  cashInKHR: number;
}

/** Cash income posted into the branch's USD and KHR cash drawer accounts on a date. Currencies are never mixed. */
export function expectedCash(accounts: FinancialAccount[], transactions: Transaction[], branchId: ID | undefined, date: ISODate | undefined): ExpectedCash {
  const drawers = branchId ? accounts.filter((a) => a.type === "cash" && a.branchId === branchId) : [];
  const usdAccounts = drawers.filter((a) => a.currency === "USD");
  const khrAccounts = drawers.filter((a) => a.currency === "KHR");
  const usdIds = new Set(usdAccounts.map((a) => a.id));
  const khrIds = new Set(khrAccounts.map((a) => a.id));
  const onDay = date ? transactions.filter((t) => t.date === date && t.type === "income") : [];
  const usdTx = onDay.filter((t) => t.currency === "USD" && usdIds.has(t.accountId));
  const khrTx = onDay.filter((t) => t.currency === "KHR" && khrIds.has(t.accountId));
  return {
    usdAccounts,
    khrAccounts,
    usdTx,
    khrTx,
    cashInUSD: roundMoney(usdTx.reduce((s, t) => s + t.amount, 0), "USD"),
    cashInKHR: roundMoney(khrTx.reduce((s, t) => s + t.amount, 0), "KHR"),
  };
}

/** Opening float: most recent earlier session for the branch, else the USD drawer's opening balance and no KHR float. */
export function defaultFloats(sessions: TillSession[], accounts: FinancialAccount[], branchId: ID | undefined, date: ISODate | undefined, excludeId?: ID): { usd: number; khr: number } {
  if (!branchId) return { usd: 0, khr: 0 };
  const prev = sessions
    .filter((s) => s.branchId === branchId && s.id !== excludeId && (!date || s.date < date))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (prev) return { usd: prev.openingFloatUSD, khr: prev.openingFloatKHR };
  const usdDrawer = accounts.find((a) => a.type === "cash" && a.branchId === branchId && a.currency === "USD");
  return { usd: usdDrawer?.openingBalance ?? 0, khr: 0 };
}

/** Itemised rows for one currency plus any amount that wasn't itemised (older counts recorded whole notes only). */
export function denominationRows(s: Pick<TillSession, "denominations" | "countedUSD" | "countedKHR">, currency: Currency) {
  const rows = s.denominations
    .filter((d) => d.currency === currency && d.count > 0)
    .sort((a, b) => b.value - a.value)
    .map((d) => ({ key: `${d.value}`, label: noteLabel(d.value, currency), value: d.value, count: d.count, subtotal: roundMoney(d.value * d.count, currency), coins: d.value === USD_COIN_VALUE }));
  const itemised = roundMoney(rows.reduce((sum, r) => sum + r.subtotal, 0), currency);
  const counted = currency === "USD" ? s.countedUSD : s.countedKHR;
  const remainder = roundMoney(counted - itemised, currency);
  return { rows, itemised, remainder, counted };
}

export function denominationsFrom(usdCounts: number[], coins: number, khrCounts: number[]): TillDenomination[] {
  const out: TillDenomination[] = [];
  USD_NOTES.forEach((v, i) => {
    const c = Math.max(0, Math.floor(usdCounts[i] || 0));
    if (c) out.push({ currency: "USD", value: v, count: c });
  });
  const cents = Math.round((coins || 0) * 100);
  if (cents > 0) out.push({ currency: "USD", value: USD_COIN_VALUE, count: cents });
  KHR_NOTES.forEach((v, i) => {
    const c = Math.max(0, Math.floor(khrCounts[i] || 0));
    if (c) out.push({ currency: "KHR", value: v, count: c });
  });
  return out;
}
