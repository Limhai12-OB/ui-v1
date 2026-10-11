import type { BankProvider, Currency } from "@/types";
import { guessDateFormat, parseCSV, type DateFormat } from "@/features/import/lib/csv";

export type AmountMode = "split" | "typed" | "signed";

export interface ColumnMapping {
  date: string;
  description: string;
  amountMode: AmountMode;
  /** split: money in / credit column */
  moneyIn: string;
  /** split: money out / debit column */
  moneyOut: string;
  /** signed / typed: single amount column */
  amount: string;
  /** typed: CR/DR indicator column */
  type: string;
  reference: string;
  dateFormat: DateFormat;
}

export const NONE = "__none";

export interface BankFormat {
  id: "ABA" | "Wing" | "ACLEDA" | "generic";
  label: string;
  bank?: BankProvider;
  columns: string;
}

export const BANK_FORMATS: Record<BankFormat["id"], BankFormat> = {
  ABA: { id: "ABA", label: "ABA Bank statement", bank: "ABA", columns: "Date, Transaction Details, Money In, Money Out, Balance" },
  Wing: { id: "Wing", label: "Wing Business export", bank: "Wing", columns: "Txn Date, Description, Amount, Type(CR/DR), Reference" },
  ACLEDA: { id: "ACLEDA", label: "ACLEDA statement", bank: "ACLEDA", columns: "Value Date, Narrative, Debit, Credit, Ref No" },
  generic: { id: "generic", label: "Generic CSV", columns: "Detected from header row" },
};

export interface ParsedStatement {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: string[][];
  format: BankFormat;
  /** Currency stated by the file (samples) — unknown for arbitrary uploads. */
  currency?: Currency;
  sampleId?: string;
}

export class StatementParseError extends Error {}

/** True when the text contains control characters typical of binary files. */
export function looksBinary(text: string): boolean {
  const head = text.slice(0, 2000);
  let ctrl = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32) || c === 0xfffd) ctrl++;
  }
  return ctrl > 3;
}

const has = (headers: string[], name: string) => headers.some((h) => h.toLowerCase() === name.toLowerCase());
const find = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) ?? NONE;

/** Identify the bank export format from its header row. */
export function detectFormat(headers: string[]): BankFormat {
  if (has(headers, "Transaction Details") && has(headers, "Money In")) return BANK_FORMATS.ABA;
  if (has(headers, "Txn Date") && headers.some((h) => /type/i.test(h))) return BANK_FORMATS.Wing;
  if (has(headers, "Value Date") && has(headers, "Narrative")) return BANK_FORMATS.ACLEDA;
  return BANK_FORMATS.generic;
}

/**
 * Parse CSV text into a statement. Bank exports often have preamble lines
 * (account name, period) — the header row is the first row with a date column.
 */
export function parseStatementText(text: string, fileName: string, fileSize: number, extra?: Pick<ParsedStatement, "currency" | "sampleId">): ParsedStatement {
  if (looksBinary(text)) {
    throw new StatementParseError("The file contains binary data and isn't a readable CSV. It may be corrupted or saved in another format — export the statement again as CSV from your bank's portal.");
  }
  const all = parseCSV(text);
  const headerIdx = all.findIndex((r) => r.length >= 3 && r.some((c) => /date/i.test(c)));
  if (headerIdx < 0) throw new StatementParseError("No header row with a date column was found. Check that this is a transaction statement export (not a PDF or summary report).");
  const headers = all[headerIdx];
  const rows = all.slice(headerIdx + 1).filter((r) => !/^(opening|closing|total)/i.test(r[0] ?? "") && !/^(opening|closing|total)/i.test(r[1] ?? ""));
  if (rows.length === 0) throw new StatementParseError("The statement has a header row but no transaction rows.");
  const width = headers.length;
  const ragged = rows.filter((r) => Math.abs(r.length - width) > 1).length;
  if (ragged > rows.length / 2) throw new StatementParseError(`Most rows don't match the ${width}-column header — the file may be truncated or use an unsupported layout.`);
  return { fileName, fileSize, headers, rows: rows.map((r) => headers.map((_, i) => r[i] ?? "")), format: detectFormat(headers), ...extra };
}

/** Auto-detected column mapping for a parsed statement. */
export function autoMapping(p: ParsedStatement): ColumnMapping {
  const h = p.headers;
  const col = (name: string) => h.find((x) => x.toLowerCase() === name.toLowerCase()) ?? NONE;
  const base = { reference: NONE, amount: NONE, type: NONE, moneyIn: NONE, moneyOut: NONE };
  let m: Omit<ColumnMapping, "dateFormat">;
  switch (p.format.id) {
    case "ABA":
      m = { ...base, date: col("Date"), description: col("Transaction Details"), amountMode: "split", moneyIn: col("Money In"), moneyOut: col("Money Out") };
      break;
    case "Wing":
      m = { ...base, date: col("Txn Date"), description: col("Description"), amountMode: "typed", amount: col("Amount"), type: find(h, /type/i), reference: col("Reference") };
      break;
    case "ACLEDA":
      m = { ...base, date: col("Value Date"), description: col("Narrative"), amountMode: "split", moneyIn: col("Credit"), moneyOut: col("Debit"), reference: col("Ref No") };
      break;
    default: {
      const moneyIn = find(h, /money in|credit|deposit|paid in/i);
      const moneyOut = find(h, /money out|debit|withdraw|paid out/i);
      const type = find(h, /^type|cr\/dr|dr\/cr/i);
      const amount = find(h, /amount|value/i);
      m = {
        ...base,
        date: find(h, /date/i),
        description: find(h, /desc|detail|narrative|particular|memo|remark/i),
        reference: find(h, /ref/i),
        ...(moneyIn !== NONE && moneyOut !== NONE ? { amountMode: "split" as const, moneyIn, moneyOut } : type !== NONE && amount !== NONE ? { amountMode: "typed" as const, amount, type } : { amountMode: "signed" as const, amount }),
      };
    }
  }
  const idx = h.indexOf(m.date);
  const dateFormat = guessDateFormat(idx >= 0 ? p.rows.slice(0, 30).map((r) => r[idx]) : []);
  return { ...m, dateFormat };
}

export function mappingProblems(m: ColumnMapping): string[] {
  const out: string[] = [];
  if (m.date === NONE) out.push("Choose the date column.");
  if (m.description === NONE) out.push("Choose the description column.");
  if (m.amountMode === "split" && (m.moneyIn === NONE || m.moneyOut === NONE)) out.push("Choose both the money in and money out columns.");
  if (m.amountMode !== "split" && m.amount === NONE) out.push("Choose the amount column.");
  if (m.amountMode === "typed" && m.type === NONE) out.push("Choose the CR/DR type column.");
  return out;
}
