import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import type { ISODate, ISODateTime } from "@/types";

/**
 * The demo runs on a fixed business clock so mock data, overdue states and
 * forecasts stay deterministic. Replace `today()` with the real date when the
 * backend is connected.
 */
export const DEMO_TODAY: ISODate = "2026-10-11";

export function today(): ISODate {
  return DEMO_TODAY;
}

export function todayDate(): Date {
  return parseISO(DEMO_TODAY);
}

/** Timestamp on the demo date using the real wall-clock time of day. */
export function nowISO(): ISODateTime {
  const real = new Date();
  const d = todayDate();
  d.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
  return d.toISOString();
}

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISO(iso), days));
}

export function daysBetween(fromIso: ISODate, toIso: ISODate): number {
  return differenceInCalendarDays(parseISO(toIso), parseISO(fromIso));
}

export function formatDate(iso: string | undefined, pattern = "dd MMM yyyy"): string {
  if (!iso) return "—";
  return format(parseISO(iso), pattern);
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  return format(parseISO(iso), "dd MMM yyyy, HH:mm");
}

export function formatMonth(month: string): string {
  return format(parseISO(`${month}-01`), "MMMM yyyy");
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function monthRange(month: string): { start: ISODate; end: ISODate } {
  const d = parseISO(`${month}-01`);
  return { start: toISODate(startOfMonth(d)), end: toISODate(endOfMonth(d)) };
}

export function previousMonth(month: string): string {
  return format(subMonths(parseISO(`${month}-01`), 1), "yyyy-MM");
}

export function isBetween(iso: ISODate, start: ISODate, end: ISODate): boolean {
  return iso >= start && iso <= end;
}

/** Relative label like "in 3 days", "2 days ago", "today". */
export function relativeDays(iso: ISODate): string {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
}
