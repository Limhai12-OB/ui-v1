/**
 * Built-in sample statements. Each is real CSV text in the bank's own export
 * layout and goes through the same parser as uploaded files. Rows dated before
 * 10 Oct 2026 intentionally overlap transactions already in the ledger (from the
 * POS integration and import imp_005) so duplicate detection has work to do.
 */
import type { BankProvider, Currency, ID } from "@/types";
import { toCSV } from "@/features/import/lib/csv";

export interface StatementSample {
  id: "aba" | "wing" | "acleda" | "corrupted";
  label: string;
  fileName: string;
  bank: BankProvider;
  currency: Currency;
  /** Account this export belongs to in the demo business. */
  suggestedAccountId: ID;
  columns: string;
  description: string;
  fileKind: "CSV" | "Excel sample";
  build: () => string;
}

/* ABA: Date, Transaction Details, Money In, Money Out, Balance ("dd MMM yyyy") */
const ABA_ROWS: [string, string, string, string][] = [
  ["01 Oct 2026", "KHQR SETTLEMENT - POS", "493.23", ""],
  ["01 Oct 2026", "SHOP RENT - 2026-10", "", "3,200.00"],
  ["02 Oct 2026", "PURCHASE KHQR TELA FUEL ST 1032", "", "38.50"],
  ["03 Oct 2026", "TRF TO 012 445 908 SOK CHHAY", "", "129.00"],
  ["08 Oct 2026", "TRF TO 088 201 557 PRINT HOUSE PP", "", "310.00"],
  ["09 Oct 2026", "INTEREST CREDIT", "12.34", ""],
  ["10 Oct 2026", "KHQR SETTLEMENT - POS", "661.23", ""],
  ["10 Oct 2026", "PURCHASE KHQR TELA FUEL ST 1032", "", "41.20"],
  ["10 Oct 2026", "ABA PAY GRAB*TRIP 7781", "", "9.40"],
  ["10 Oct 2026", "ABA PAY GRAB*TRIP 7781", "", "9.40"],
  ["10 Oct 2026", "PURCHASE FACEBK *ADS 8821", "", "45.00"],
  ["10 Oct 2026", "EDC BILL PAYMENT 0012 3345 BKK1", "", "214.60"],
  ["10 Oct 2026", "TRF FROM 011 887 302 SOVANN MINI MART", "250.00", ""],
  ["", "PURCHASE KHQR CAFE AMAZON 2290", "", "3.75"],
  ["11 Oct 2026", "TRF TO 015 220 118 MEKONG BEVERAGE DIST", "", "1,250.00"],
  ["11 Oct 2026", "PAYROLL BATCH OCT SALARY ADVANCE", "", "600.00"],
  ["11 Oct 2026", "SERVICE CHARGE SMS ALERT", "", "1.50"],
  ["11 Oct 2026", "ATM CASH WITHDRAWAL FEE", "", "2.00"],
  ["11 Oct 2026", "ABA PAY LUCKY SUPERMARKET SORYA", "", "22.80"],
  ["11 Oct 2026", "TRF TO 096 554 120 CHAN DARA", "", "75.00"],
  ["11 Oct 2026", "TRF FROM 092 118 400 PHSAR THMEI STALL 12", "", ""],
];

function buildABA(): string {
  let bal = 24_812.65;
  const rows = ABA_ROWS.map(([d, desc, inn, out]) => {
    const n = (s: string) => (s ? Number(s.replace(/,/g, "")) : 0);
    bal = Math.round((bal + n(inn) - n(out)) * 100) / 100;
    return [d, desc, inn, out, bal.toLocaleString("en-US", { minimumFractionDigits: 2 })];
  });
  return [
    "ABA Bank – Account Statement",
    "Account: ANGKOR FRESH MART CO LTD,•••• 4821 (USD)",
    "Period: 01 Oct 2026 - 11 Oct 2026",
    "",
    toCSV([["Date", "Transaction Details", "Money In", "Money Out", "Balance"], ...rows]),
  ].join("\r\n");
}

/* Wing: Txn Date, Description, Amount, Type(CR/DR), Reference ("yyyy-MM-dd HH:mm") */
const WING_ROWS: [string, string, string, string, string][] = [
  ["2026-10-01 21:05", "WING MERCHANT SETTLEMENT", "364.41", "CR", "WG2610010091"],
  ["2026-10-01 09:12", "SHOP RENT - 2026-10", "1,500.00", "DR", "WG2610010017"],
  ["2026-10-03 21:04", "WING MERCHANT SETTLEMENT", "477.43", "CR", "WG2610030088"],
  ["2026-10-10 21:02", "WING MERCHANT SETTLEMENT", "427.17", "CR", "WG2610100090"],
  ["2026-10-10 08:41", "PAY TO TELA FUEL SIEM REAP 0418", "35.00", "DR", "WG2610100011"],
  ["2026-10-10 10:15", "PAY TO ANGKOR ICE FACTORY", "48.00", "DR", "WG2610100023"],
  ["2026-10-10 11:30", "WING TOPUP SMART AXIATA 010 552 331", "10.00", "DR", "WG2610100031"],
  ["2026-10-10 11:30", "WING TRANSFER FEE", "0.50", "DR", "WG2610100032"],
  ["2026-10-10 14:22", "PAY TO GRAB EXPRESS DELIVERY", "6.80", "DR", "WG2610100047"],
  ["2026-10-10 15:03", "TRF FROM ANGKOR PARADISE GUESTHOUSE", "180.00", "CR", "WG2610100052"],
  ["2026-10-11 08:02", "PAY TO SIEM REAP WATER SUPPLY", "18.40", "DR", "WG2610110004"],
  ["2026-10-11 09:47", "CASH IN AGENT 0921 PSAR CHAS", "200.00", "CR", "WG2610110013"],
  ["2026-10-11 12:10", "PAY TO GOLDEN HARVEST TRADING", "640.00", "DR", "WG2610110021"],
  ["2026-10-11 13:30", "WING TRANSFER FEE", "0.50", "DR", "WG2610110022"],
  ["2026-10-11 16:45", "PAY TO 077 210 664 SOK LIN", "25.00", "DR", "WG2610110040"],
  ["2026-10-11 17:20", "PAY TO PHSAR CHAS SUPPLIES", "", "DR", "WG2610110044"],
  ["32/10/2026", "WING MERCHANT SETTLEMENT", "412.10", "CR", "WG2610110093"],
  ["2026-10-11 21:01", "WING MERCHANT SETTLEMENT", "425.52", "CR", "WG2610110090"],
];

function buildWing(): string {
  return toCSV([["Txn Date", "Description", "Amount", "Type(CR/DR)", "Reference"], ...WING_ROWS]);
}

/* ACLEDA: Value Date, Narrative, Debit, Credit, Ref No ("dd/MM/yyyy") */
const ACLEDA_ROWS: [string, string, string, string, string][] = [
  ["01/10/2026", "KHQR SETTLEMENT - POS", "", "420.72", "FT26274A0011"],
  ["01/10/2026", "SHOP RENT - 2026-10", "2,100.00", "", "FT26274A0002"],
  ["02/10/2026", "KHQR SETTLEMENT - POS", "", "405.59", "FT26275A0013"],
  ["06/10/2026", "DRY GOODS RESTOCK", "2,099.38", "", "FT26279A0040"],
  ["10/10/2026", "KHQR SETTLEMENT - POS", "", "581.03", "FT26283A0012"],
  ["10/10/2026", "TRF TO GOLDEN HARVEST TRADING", "820.00", "", "FT26283A0031"],
  ["10/10/2026", "EDC ELECTRICITY TK 10/2026", "412.30", "", "FT26283A0035"],
  ["10/10/2026", "TRF FROM BOENG KAK NOODLE SHOP", "", "157.00", "FT26283A0041"],
  ["10/10/2026", "GRAB EXPRESS DELIVERY", "6.50", "", "FT26283A0044"],
  ["11/10/2026", "STAFF SALARY ADVANCE - SREY MOM", "150.00", "", "FT26284A0003"],
  ["11/10/2026", "ACLEDA ANNUAL CARD FEE", "5.00", "", "FT26284A0006"],
  ["11/10/2026", "INTEREST ON CURRENT ACCOUNT", "", "3.12", "FT26284A0007"],
  ["11/10/2026", "TRF TO 012 998 771", "60.00", "", "FT26284A0019"],
  ["11/10/2026", "PURCHASE PTT STATION TOUL KORK", "28.00", "", "FT26284A0024"],
  ["", "TRF TO COOL TECH SERVICES", "260.00", "", "FT26284A0027"],
  ["11/10/2026", "TRF FROM LUCKY CAFE TOUL KORK", "", "", "FT26284A0030"],
  ["11/10/2026", "KHQR SETTLEMENT - POS", "", "480.10", "FT26284A0012"],
];

function buildACLEDA(): string {
  return [
    "ACLEDA Bank Plc. - Statement of Account",
    "Account No,•••• 1094,Currency,USD",
    "",
    toCSV([["Value Date", "Narrative", "Debit", "Credit", "Ref No"], ...ACLEDA_ROWS]),
    "Closing Balance,,,,",
  ].join("\r\n");
}

function buildCorrupted(): string {
  // Simulates a truncated/binary file renamed to .csv
  return "PK\u0003\u0004\u0014\u0000\u0006\u0000\b\u0000\u0000\u0000!\u0000ÿxl/workbook.xml\u0001\u0002\u0003 ��� ABA Statement Oct 2026 ���";
}

export const STATEMENT_SAMPLES: StatementSample[] = [
  {
    id: "aba",
    label: "ABA Bank statement (CSV)",
    fileName: "ABA_4821_01-11Oct2026.csv",
    bank: "ABA",
    currency: "USD",
    suggestedAccountId: "acc_aba_usd",
    columns: "Date, Transaction Details, Money In, Money Out, Balance",
    description: "21 rows from ABA Business USD •••• 4821, incl. lines already imported and two rows with missing data.",
    fileKind: "CSV",
    build: buildABA,
  },
  {
    id: "wing",
    label: "Wing Business export (Excel sample)",
    fileName: "Wing_Business_5512_Oct2026.csv",
    bank: "Wing",
    currency: "USD",
    suggestedAccountId: "acc_wing_usd",
    columns: "Txn Date, Description, Amount, Type(CR/DR), Reference",
    description: "18 wallet movements for Siem Reap, provided as the CSV equivalent of Wing's Excel export.",
    fileKind: "Excel sample",
    build: buildWing,
  },
  {
    id: "acleda",
    label: "ACLEDA statement (CSV)",
    fileName: "ACLEDA_1094_Oct2026.csv",
    bank: "ACLEDA",
    currency: "USD",
    suggestedAccountId: "acc_acleda_usd",
    columns: "Value Date, Narrative, Debit, Credit, Ref No",
    description: "17 rows from ACLEDA Current USD •••• 1094 (Toul Kork), incl. a missing date and a missing amount.",
    fileKind: "CSV",
    build: buildACLEDA,
  },
  {
    id: "corrupted",
    label: "Corrupted file (fails parsing)",
    fileName: "ABA_statement_Oct2026_damaged.csv",
    bank: "ABA",
    currency: "USD",
    suggestedAccountId: "acc_aba_usd",
    columns: "Unreadable",
    description: "A damaged export. Shows how a failed import is recorded with an error message and retried.",
    fileKind: "CSV",
    build: buildCorrupted,
  },
];

export function sampleById(id: string | null | undefined): StatementSample | undefined {
  return STATEMENT_SAMPLES.find((s) => s.id === id);
}
