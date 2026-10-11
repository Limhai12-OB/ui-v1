/**
 * Built-in sample documents for the shared AI import. Extracted values and
 * confidences are fixed (simulated OCR) so every run behaves the same.
 * - The EDC Sen Sok bill already exists as BILL-2026-0013 → duplicate.
 * - The ABA payment confirmation matches INV-2026-0022 (Golden Lotus Restaurant).
 * - The catalog repeats existing SKUs BEV-001/BEV-002 and one SKU within the file.
 */
import type { Currency, ID } from "@/types";
import { toCSV } from "./csv";
import type { DocKind, FieldSuggestion, SingleKind, TableKind } from "./doc-model";

export interface SingleSample {
  id: string;
  kind: SingleKind;
  title: string;
  fileName: string;
  fileSize: number;
  summary: string;
  extracted: Record<string, { value: string; confidence: number }>;
  suggestions: FieldSuggestion[];
  /** Render data for the preview. */
  doc: ReceiptDoc | BillDoc | PaymentDoc;
}

export interface ReceiptDoc {
  type: "receipt";
  merchant: string;
  address: string;
  vatTin: string;
  dateText: string;
  no: string;
  lines: { label: string; qty: string; amount: string }[];
  total: string;
  khrTotal: string;
  paidBy: string;
}

export interface BillDoc {
  type: "bill";
  issuer: string;
  issuerKm?: string;
  address: string;
  billTo: string;
  no: string;
  dateText: string;
  dueText: string;
  lines: { label: string; amount: string }[];
  total: string;
  currency: Currency;
  note?: string;
}

export interface PaymentDoc {
  type: "payment";
  app: "ABA Mobile" | "Wing";
  amount: string;
  currency: Currency;
  from: string;
  fromAcc: string;
  to: string;
  toAcc: string;
  trxId: string;
  dateText: string;
  remark: string;
}

export interface TableSample {
  id: string;
  kind: TableKind;
  title: string;
  fileName: string;
  summary: string;
  currency: Currency;
  /** spreadsheet: the account rows belong to by default */
  accountId?: ID;
  build: () => string;
}

export const SINGLE_SAMPLES: SingleSample[] = [
  {
    id: "tela-receipt",
    kind: "receipt",
    title: "Tela fuel receipt",
    fileName: "IMG_20261011_Tela_receipt.jpg",
    fileSize: 412_880,
    summary: "Diesel for the delivery van, paid by KHQR from ABA USD.",
    extracted: {
      merchant: { value: "Tela Fuel Station", confidence: 0.97 },
      date: { value: "2026-10-11", confidence: 0.74 },
      receiptNo: { value: "TL-BKK1-0088213", confidence: 0.9 },
      currency: { value: "USD", confidence: 0.98 },
      amount: { value: "36.80", confidence: 0.95 },
      description: { value: "Diesel 32.0 L", confidence: 0.81 },
    },
    suggestions: [
      { key: "categoryId", value: "cat_transport", reason: "Fuel station purchase", confidence: 0.91 },
      { key: "accountId", value: "acc_aba_usd", reason: "Receipt shows “Paid by KHQR – ABA •••• 4821”", confidence: 0.88 },
      { key: "description", value: "Diesel for delivery van – Tela Fuel Station", reason: "Clearer description from the line items", confidence: 0.77 },
    ],
    doc: {
      type: "receipt",
      merchant: "TELA FUEL STATION",
      address: "St. 278 x Norodom Blvd, BKK1, Phnom Penh",
      vatTin: "VAT TIN: K001-901234567",
      dateText: "11/10/2026  07:42",
      no: "TL-BKK1-0088213",
      lines: [
        { label: "DIESEL EURO 5", qty: "32.00 L × 1.15", amount: "36.80" },
      ],
      total: "36.80",
      khrTotal: "150,880",
      paidBy: "KHQR – ABA •••• 4821",
    },
  },
  {
    id: "edc-bill",
    kind: "supplier_bill",
    title: "EDC electricity bill (KHR)",
    fileName: "EDC_SenSok_Oct2026.jpg",
    fileSize: 842_310,
    summary: "Sen Sok connection & first bill — already recorded as BILL-2026-0013.",
    extracted: {
      supplier: { value: "EDC Electricity", confidence: 0.96 },
      billNo: { value: "EDC-SS-2610-55871", confidence: 0.88 },
      issueDate: { value: "2026-10-05", confidence: 0.93 },
      dueDate: { value: "2026-10-19", confidence: 0.9 },
      currency: { value: "KHR", confidence: 0.99 },
      amount: { value: "980000", confidence: 0.94 },
      description: { value: "Electricity – connection & first bill", confidence: 0.8 },
    },
    suggestions: [
      { key: "categoryId", value: "cat_utilities", reason: "Electricité du Cambodge is a utility provider", confidence: 0.95 },
      { key: "branchId", value: "br_ss", reason: "Service address is the Sen Sok branch", confidence: 0.9 },
    ],
    doc: {
      type: "bill",
      issuer: "ELECTRICITÉ DU CAMBODGE (EDC)",
      issuerKm: "អគ្គិសនីកម្ពុជា",
      address: "Street 19, Wat Phnom, Phnom Penh",
      billTo: "Angkor Fresh Mart – Sen Sok, St. 1986, Phnom Penh Thmey",
      no: "EDC-SS-2610-55871",
      dateText: "05 Oct 2026",
      dueText: "19 Oct 2026",
      lines: [
        { label: "Meter connection fee", amount: "420,000" },
        { label: "Consumption 01–04 Oct (684 kWh)", amount: "560,000" },
      ],
      total: "980,000",
      currency: "KHR",
      note: "Pay at any EDC counter, ABA, ACLEDA or Wing.",
    },
  },
  {
    id: "mekong-bill",
    kind: "supplier_bill",
    title: "Mekong Beverage invoice (USD)",
    fileName: "Mekong_INV_MB-77421.pdf",
    fileSize: 188_402,
    summary: "New October beverage consignment for BKK1 — not yet recorded.",
    extracted: {
      supplier: { value: "Mekong Beverage Distribution", confidence: 0.95 },
      billNo: { value: "MB-77421", confidence: 0.93 },
      issueDate: { value: "2026-10-09", confidence: 0.92 },
      dueDate: { value: "", confidence: 0 },
      currency: { value: "USD", confidence: 0.97 },
      amount: { value: "3,284.60", confidence: 0.68 },
      description: { value: "Beverage consignment – October", confidence: 0.82 },
    },
    suggestions: [
      { key: "dueDate", value: "2026-11-08", reason: "Terms “Net 30” printed on the invoice", confidence: 0.86 },
      { key: "categoryId", value: "cat_cogs", reason: "Known stock supplier", confidence: 0.93 },
      { key: "branchId", value: "br_main", reason: "Delivery address is BKK1", confidence: 0.88 },
    ],
    doc: {
      type: "bill",
      issuer: "MEKONG BEVERAGE DISTRIBUTION CO., LTD.",
      address: "National Road 4, Kambol, Phnom Penh · VAT TIN K002-100778812",
      billTo: "Angkor Fresh Mart – BKK1, St. 278, Phnom Penh",
      no: "MB-77421",
      dateText: "09/10/2026",
      dueText: "Net 30",
      lines: [
        { label: "Lager Beer Can 330ml (24) × 120", amount: "1,608.00" },
        { label: "Draft Beer Can 500ml (24) × 60", amount: "1,056.00" },
        { label: "Drinking Water 1.5L (6) × 200", amount: "320.00" },
        { label: "VAT 10% on beer", amount: "300.60" },
      ],
      total: "3,284.60",
      currency: "USD",
      note: "Payment terms: Net 30 days from invoice date.",
    },
  },
  {
    id: "aba-payment",
    kind: "payment_screenshot",
    title: "ABA payment confirmation screenshot",
    fileName: "Screenshot_ABA_20261011_0932.png",
    fileSize: 256_114,
    summary: "Golden Lotus Restaurant paid $119.49 by ABA transfer.",
    extracted: {
      payer: { value: "GOLDEN LOTUS RESTAURANT", confidence: 0.94 },
      date: { value: "2026-10-11", confidence: 0.96 },
      reference: { value: "100FT33620284011", confidence: 0.91 },
      currency: { value: "USD", confidence: 0.99 },
      amount: { value: "119.49", confidence: 0.97 },
      note: { value: "INV 0022", confidence: 0.7 },
    },
    suggestions: [{ key: "accountId", value: "acc_aba_usd", reason: "Credited to ANGKOR FRESH MART •••• 4821", confidence: 0.93 }],
    doc: {
      type: "payment",
      app: "ABA Mobile",
      amount: "119.49",
      currency: "USD",
      from: "GOLDEN LOTUS RESTAURANT",
      fromAcc: "000 551 207",
      to: "ANGKOR FRESH MART CO LTD",
      toAcc: "•••• 4821",
      trxId: "100FT33620284011",
      dateText: "Oct 11, 2026 09:31 AM",
      remark: "INV 0022",
    },
  },
];

export const TABLE_SAMPLES: TableSample[] = [
  {
    id: "mekong-catalog",
    kind: "item_catalog",
    title: "Supplier price catalog CSV",
    fileName: "Mekong_Beverage_PriceList_Oct2026.csv",
    summary: "9 products incl. 2 SKUs you already stock, a repeated SKU and a missing price.",
    currency: "USD",
    build: () =>
      toCSV([
        ["SKU", "Product name", "Unit", "Cost price (USD)", "Selling price (USD)", "Reorder level"],
        ["BEV-001", "Lager Beer Can 330ml (24)", "case", "13.40", "16.80", "12"],
        ["BEV-002", "Draft Beer Can 500ml (24)", "case", "17.60", "21.50", "8"],
        ["BEV-007", "Angkor Energy Drink 250ml", "can", "0.42", "0.75", "48"],
        ["BEV-008", "Sparkling Water 500ml", "bottle", "0.38", "0.70", "36"],
        ["BEV-009", "Mango Juice 1L", "bottle", "1.10", "1.85", "24"],
        ["BEV-010", "Cola Can 330ml (24)", "case", "7.20", "9.60", "10"],
        ["COF-003", "Iced Milk Coffee Bottle 280ml", "bottle", "0.55", "", "30"],
        ["BEV-008", "Sparkling Water 500ml", "bottle", "0.38", "0.70", "36"],
        ["BEV-011", "Coconut Water 1L", "bottle", "1.30", "1.20", "18"],
      ]),
  },
  {
    id: "petty-cash",
    kind: "spreadsheet",
    title: "Petty cash spreadsheet (CSV)",
    fileName: "BKK1_petty_cash_Oct2026.csv",
    summary: "8 cash-drawer movements for BKK1, incl. a duplicate line and a missing amount.",
    currency: "USD",
    accountId: "acc_cash_main",
    build: () =>
      toCSV([
        ["Date", "Description", "Type", "Amount (USD)"],
        ["09/10/2026", "Ice delivery – Angkor Ice Factory", "Expense", "12.00"],
        ["09/10/2026", "Tuk-tuk delivery to Riverside Bistro", "Expense", "3.50"],
        ["10/10/2026", "Cleaning supplies – Phsar Thmei Supplies", "Expense", "8.75"],
        ["10/10/2026", "Sale of empty bottle crates (rebate)", "Income", "15.00"],
        ["10/10/2026", "Tuk-tuk delivery to Riverside Bistro", "Expense", "3.50"],
        ["11/10/2026", "Grab Express parcel to Sen Sok", "Expense", "4.20"],
        ["11/10/2026", "Staff drinking water", "Expense", ""],
        ["10/10/2026", "Tuk-tuk delivery to Riverside Bistro", "Expense", "3.50"],
      ]),
  },
];

export function samplesFor(kind: DocKind) {
  return [...SINGLE_SAMPLES.filter((s) => s.kind === kind), ...TABLE_SAMPLES.filter((s) => s.kind === kind)];
}
