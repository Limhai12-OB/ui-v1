/**
 * Small RFC-4180 style CSV parser used for client-side parsing of statements,
 * catalogs and spreadsheets. Handles quoted fields, escaped quotes, CRLF and
 * a UTF-8 BOM. Excel (.xlsx/.xls) is binary and is parsed by the import service.
 */
export function parseCSV(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join("\n");
  const counts = [",", ";", "\t"].map((d) => [d, firstLines.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ",";
}

/** Serialize rows to CSV (used to build the built-in sample files). */
export function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Parse a money cell: "$1,250.00", "(12.50)", "-3.75", "1 250,00" → number; blank → undefined; garbage → NaN. */
export function parseAmountCell(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (!s || s === "-" || s === "—") return undefined;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$៛]|USD|KHR|\s/gi, "");
  if (s.startsWith("-") || s.startsWith("−")) {
    neg = !neg;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  // "1.250,00" (European) → "1250.00"
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  const n = Number(s);
  return neg ? -n : n;
}

export const DATE_FORMATS = ["dd MMM yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1) return undefined;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse a date cell in the given format (time portions are ignored). Returns ISO yyyy-MM-dd or undefined. */
export function parseDateCell(raw: string | undefined, fmt: DateFormat): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  switch (fmt) {
    case "dd MMM yyyy":
      m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})/);
      if (!m) return undefined;
      return iso(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
    case "dd/MM/yyyy":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : undefined;
    case "MM/dd/yyyy":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      return m ? iso(Number(m[3]), Number(m[1]), Number(m[2])) : undefined;
    case "yyyy-MM-dd":
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      return m ? iso(Number(m[1]), Number(m[2]), Number(m[3])) : undefined;
    case "dd-MM-yyyy":
      m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      return m ? iso(Number(m[3]), Number(m[2]), Number(m[1])) : undefined;
  }
}

/** Pick the date format that parses the most sample values. */
export function guessDateFormat(values: string[]): DateFormat {
  let best: DateFormat = "yyyy-MM-dd";
  let bestScore = -1;
  for (const f of DATE_FORMATS) {
    const score = values.filter((v) => parseDateCell(v, f)).length;
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Normalize for fuzzy-but-deterministic comparisons (supplier names, SKUs). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
