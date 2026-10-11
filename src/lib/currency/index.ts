import type { Currency, Money } from "@/types";

const usdFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const khrFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const CURRENCY_META: Record<Currency, { symbol: string; label: string; decimals: number }> = {
  USD: { symbol: "$", label: "US Dollar", decimals: 2 },
  KHR: { symbol: "៛", label: "Cambodian Riel", decimals: 0 },
};

export interface FormatMoneyOptions {
  /** Abbreviate large numbers: $12.4K, ៛48.2M */
  compact?: boolean;
  /** Prefix + for positive values (for deltas / signed amounts). */
  signed?: boolean;
  /** Append the ISO code instead of using a symbol: "1,200.00 USD". */
  code?: boolean;
}

/** Round to the currency's minor unit (cents for USD, whole riel for KHR). */
export function roundMoney(amount: number, currency: Currency): number {
  const f = currency === "USD" ? 100 : 1;
  return Math.round(amount * f) / f;
}

export function formatMoney(amount: number, currency: Currency, opts: FormatMoneyOptions = {}): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  let body: string;
  if (opts.compact && abs >= 10_000) body = compactFormatter.format(abs);
  else body = currency === "USD" ? usdFormatter.format(abs) : khrFormatter.format(abs);

  const sign = negative ? "−" : opts.signed && amount > 0 ? "+" : "";
  if (opts.code) return `${sign}${body} ${currency}`;
  return `${sign}${CURRENCY_META[currency].symbol}${body}`;
}

export function formatMoneyValue(m: Money, opts?: FormatMoneyOptions): string {
  return formatMoney(m.amount, m.currency, opts);
}

export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function formatPercent(n: number, decimals = 1, signed = false): string {
  const s = `${Math.abs(n).toFixed(decimals)}%`;
  if (n < 0) return `−${s}`;
  return signed && n > 0 ? `+${s}` : s;
}

/**
 * Convert between currencies ONLY with an explicitly configured rate.
 * Returns null when no rate is configured — callers must then show amounts separately.
 */
export function convert(amount: number, from: Currency, to: Currency, khrPerUsd: number | null): number | null {
  if (from === to) return amount;
  if (!khrPerUsd || khrPerUsd <= 0) return null;
  return from === "USD" ? roundMoney(amount * khrPerUsd, "KHR") : roundMoney(amount / khrPerUsd, "USD");
}

export interface AggregatedMoney {
  /** Total in the display currency; null when mixed currencies cannot be converted. */
  total: number | null;
  displayCurrency: Currency;
  byCurrency: Record<Currency, number>;
  /** True when part of the total was converted using the configured rate. */
  converted: boolean;
  rate: number | null;
}

/**
 * Sum money values for display. Amounts in other currencies are converted only
 * if a rate is configured, and the result is flagged so the UI can label it.
 */
export function aggregateMoney(values: Money[], displayCurrency: Currency, khrPerUsd: number | null): AggregatedMoney {
  const byCurrency: Record<Currency, number> = { USD: 0, KHR: 0 };
  for (const v of values) byCurrency[v.currency] += v.amount;
  byCurrency.USD = roundMoney(byCurrency.USD, "USD");
  byCurrency.KHR = roundMoney(byCurrency.KHR, "KHR");

  const other: Currency = displayCurrency === "USD" ? "KHR" : "USD";
  if (byCurrency[other] === 0) {
    return { total: byCurrency[displayCurrency], displayCurrency, byCurrency, converted: false, rate: khrPerUsd };
  }
  const convertedOther = convert(byCurrency[other], other, displayCurrency, khrPerUsd);
  if (convertedOther === null) {
    return { total: null, displayCurrency, byCurrency, converted: false, rate: null };
  }
  return {
    total: roundMoney(byCurrency[displayCurrency] + convertedOther, displayCurrency),
    displayCurrency,
    byCurrency,
    converted: true,
    rate: khrPerUsd,
  };
}

/** Convert a single amount for display; null if not convertible. */
export function toDisplay(amount: number, from: Currency, display: Currency, khrPerUsd: number | null): number | null {
  return convert(amount, from, display, khrPerUsd);
}

export function rateLabel(khrPerUsd: number | null): string {
  return khrPerUsd ? `1 USD = ${formatNumber(khrPerUsd)} KHR` : "No conversion rate configured";
}
