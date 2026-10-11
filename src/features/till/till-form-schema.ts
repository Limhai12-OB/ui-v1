import { z } from "zod";
import type { Currency } from "@/types";
import { formatMoney, roundMoney } from "@/lib/currency";
import { today } from "@/lib/date";
import { KHR_NOTES, USD_NOTES, VARIANCE_THRESHOLD, exceedsThreshold, varianceKind } from "./till-utils";

const count = z.number({ error: "Enter a count" }).int("Whole notes only").min(0, "Counts can't be negative");

export const tillBaseSchema = z.object({
  branchId: z.string().min(1, "Choose a branch"),
  date: z
    .string()
    .min(1, "Choose the count date")
    .refine((d) => d <= today(), "Till counts can't be dated in the future"),
  shift: z.enum(["morning", "evening", "full_day"]),
  openingFloatUSD: z
    .number({ error: "Enter the USD opening float (0 if none)" })
    .min(0, "The float can't be negative")
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places"),
  openingFloatKHR: z.number({ error: "Enter the KHR opening float (0 if none)" }).int("Whole riel only").min(0, "The float can't be negative"),
  usdCounts: z.array(count).length(USD_NOTES.length),
  usdCoins: z
    .number({ error: "Enter an amount" })
    .min(0, "Can't be negative")
    .max(999.99, "That's a lot of coins — check the amount")
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places"),
  khrCounts: z.array(count).length(KHR_NOTES.length),
  /** Cash income into the drawers on the date — computed from the ledger, not typed. */
  cashInUSD: z.number(),
  cashInKHR: z.number(),
  notes: z.string().max(500, "Keep notes under 500 characters"),
});

export type TillFormValues = z.infer<typeof tillBaseSchema>;

export function countedTotals(v: Pick<TillFormValues, "usdCounts" | "usdCoins" | "khrCounts">) {
  const usd = roundMoney(USD_NOTES.reduce((s, n, i) => s + n * (v.usdCounts?.[i] || 0), 0) + (Number.isFinite(v.usdCoins) ? v.usdCoins : 0), "USD");
  const khr = roundMoney(KHR_NOTES.reduce((s, n, i) => s + n * (v.khrCounts?.[i] || 0), 0), "KHR");
  return { usd, khr };
}

export function expectedTotals(v: Pick<TillFormValues, "openingFloatUSD" | "openingFloatKHR" | "cashInUSD" | "cashInKHR">) {
  const f = (n: number) => (Number.isFinite(n) ? n : 0);
  return { usd: roundMoney(f(v.openingFloatUSD) + f(v.cashInUSD), "USD"), khr: roundMoney(f(v.openingFloatKHR) + f(v.cashInKHR), "KHR") };
}

/** Human explanation of why a note is required, or null when it isn't. */
export function noteRequirement(diffUSD: number, diffKHR: number): string | null {
  const parts: string[] = [];
  const describe = (d: number, c: Currency) => `${c} is ${varianceKind(d, c) === "over" ? "over" : "short"} by ${formatMoney(Math.abs(d), c)}`;
  if (exceedsThreshold(diffUSD, "USD")) parts.push(describe(diffUSD, "USD"));
  if (exceedsThreshold(diffKHR, "KHR")) parts.push(describe(diffKHR, "KHR"));
  if (!parts.length) return null;
  return `Explain the difference: ${parts.join(" and ")}. A note is required when a drawer is off by more than ${formatMoney(VARIANCE_THRESHOLD.USD, "USD")} or ${formatMoney(VARIANCE_THRESHOLD.KHR, "KHR")}.`;
}

export const tillSchema = tillBaseSchema.superRefine((v, ctx) => {
  const counted = countedTotals(v);
  const expected = expectedTotals(v);
  const req = noteRequirement(counted.usd - expected.usd, counted.khr - expected.khr);
  if (req && v.notes.trim().length < 5) ctx.addIssue({ code: "custom", path: ["notes"], message: req });
});
