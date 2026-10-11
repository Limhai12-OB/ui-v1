/**
 * LedgerVision domain types.
 * These mirror the shapes the Spring Boot core services and FastAPI AI services
 * are expected to return, so the mock layer can later be swapped for HTTP clients.
 *
 * Dates are ISO strings: business dates as "yyyy-MM-dd", timestamps as full ISO.
 * Money is always stored as (amount, currency). USD amounts are in dollars with
 * cents (2 dp); KHR amounts are whole riel.
 */

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export type Currency = "USD" | "KHR";
export type DisplayCurrency = Currency;
export type Language = "en" | "km";
export type Role = "owner" | "manager";

export interface Money {
  amount: number;
  currency: Currency;
}

/* ------------------------------------------------------------------ */
/* Business, users, branches                                           */
/* ------------------------------------------------------------------ */

export interface Business {
  id: ID;
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  logoDataUrl?: string;
  defaultCurrency: Currency;
  /**
   * Explicitly configured conversion rate (KHR per 1 USD).
   * When null, the app must never convert between currencies.
   */
  khrPerUsd: number | null;
  khrRateUpdatedAt?: ISODateTime;
  fiscalYearStartMonth: number; // 1-12
  createdAt: ISODateTime;
}

export interface User {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  /** Branch managers are bound to exactly one branch. */
  branchId?: ID;
  avatarInitials: string;
  authProvider: "password" | "google" | "password+google";
  createdAt: ISODateTime;
}

export type BranchStatus = "active" | "inactive";

export interface Branch {
  id: ID;
  name: string;
  code: string;
  address: string;
  city: string;
  phone: string;
  isMain: boolean;
  status: BranchStatus;
  openedAt: ISODate;
  managerId?: ID;
}

export type ManagerStatus = "active" | "invited" | "suspended";

export interface BranchManager {
  id: ID;
  name: string;
  email: string;
  phone: string;
  branchId: ID;
  status: ManagerStatus;
  invitedAt: ISODateTime;
  joinedAt?: ISODateTime;
  lastActiveAt?: ISODateTime;
  mustChangePassword?: boolean;
}

/* ------------------------------------------------------------------ */
/* Categories & accounts                                               */
/* ------------------------------------------------------------------ */

export type CategoryKind = "income" | "expense" | "item";

export interface Category {
  id: ID;
  name: string;
  nameKm?: string;
  kind: CategoryKind;
  description?: string;
  isSystem?: boolean;
}

export type AccountType = "bank" | "cash" | "ewallet";
export type BankProvider = "ABA" | "Wing" | "ACLEDA" | "Cash";

export interface FinancialAccount {
  id: ID;
  name: string;
  type: AccountType;
  provider: BankProvider;
  accountNumber: string; // masked e.g. "•••• 4821"
  currency: Currency;
  branchId: ID;
  openingBalance: number;
  openingDate: ISODate;
  status: "active" | "archived";
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export type TransactionType = "income" | "expense" | "transfer";

export type TransactionSource =
  | "manual"
  | "invoice_payment"
  | "bill_payment"
  | "item_sale"
  | "walk_in_sale"
  | "statement_import"
  | "document_import"
  | "integration";

export type TransactionStatus = "posted" | "needs_review";

export interface Transaction {
  id: ID;
  date: ISODate;
  type: TransactionType;
  amount: number; // always positive; `type` carries direction
  currency: Currency;
  accountId: ID;
  /** Destination account for transfers. */
  toAccountId?: ID;
  categoryId?: ID; // undefined => uncategorized
  branchId: ID;
  description: string;
  counterparty?: string;
  reference?: string;
  source: TransactionSource;
  /** Link back to the record that produced it (invoice id, bill id, sale id, import id). */
  sourceId?: ID;
  status: TransactionStatus;
  reconciled: boolean;
  createdBy: string;
  createdAt: ISODateTime;
  /** AI-suggested category (from import), shown until confirmed. */
  suggestedCategoryId?: ID;
  suggestionConfidence?: number; // 0-1
}

/* ------------------------------------------------------------------ */
/* Customers, invoices, planned purchases                              */
/* ------------------------------------------------------------------ */

export type CustomerType = "wholesale" | "walk_in";

export interface Customer {
  id: ID;
  name: string;
  type: CustomerType;
  contactName?: string;
  phone: string;
  email?: string;
  address?: string;
  telegram?: string;
  branchId: ID;
  paymentTermsDays: number;
  createdAt: ISODateTime;
  notes?: string;
}

export interface LineItem {
  id: ID;
  itemId?: ID;
  description: string;
  quantity: number;
  unitPrice: number;
}

export type PaymentMethod = "cash" | "aba_pay" | "wing" | "bank_transfer" | "khqr" | "card";

export interface Payment {
  id: ID;
  date: ISODate;
  amount: number;
  method: PaymentMethod;
  accountId: ID;
  transactionId: ID;
  reference?: string;
  note?: string;
}

/** Stored invoice status. "overdue" and "partially_paid"/"paid" are derived — see lib/domain. */
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "cancelled";

export interface Invoice {
  id: ID;
  number: string;
  customerId: ID;
  branchId: ID;
  issueDate: ISODate;
  dueDate: ISODate;
  currency: Currency;
  lines: LineItem[];
  discount: number; // absolute amount
  taxRate: number; // percent, e.g. 10 for VAT 10%
  /** Lifecycle flag the user controls. Payment-based statuses are derived. */
  baseStatus: "draft" | "sent" | "cancelled";
  payments: Payment[];
  notes?: string;
  source: "manual" | "voice" | "planned_purchase";
  plannedPurchaseId?: ID;
  createdAt: ISODateTime;
  sentAt?: ISODateTime;
}

export type PlannedPurchaseStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

export interface PlannedPurchase {
  id: ID;
  number: string;
  customerId: ID;
  branchId: ID;
  createdDate: ISODate;
  validUntil: ISODate;
  expectedDeliveryDate?: ISODate;
  currency: Currency;
  lines: LineItem[];
  discount: number;
  /** Stored status; "expired" is derived when validUntil has passed while still sent. */
  status: Exclude<PlannedPurchaseStatus, "expired">;
  convertedInvoiceId?: ID;
  notes?: string;
  history: { at: ISODateTime; status: PlannedPurchaseStatus; note?: string }[];
}

/* ------------------------------------------------------------------ */
/* Bills                                                               */
/* ------------------------------------------------------------------ */

export type BillStatus = "draft" | "open" | "partially_paid" | "paid" | "overdue" | "void";

export interface Bill {
  id: ID;
  number: string;
  supplier: string;
  branchId: ID;
  categoryId: ID;
  issueDate: ISODate;
  dueDate: ISODate;
  currency: Currency;
  amount: number;
  description: string;
  baseStatus: "draft" | "open" | "void";
  payments: Payment[];
  source: "manual" | "document_import";
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export interface Item {
  id: ID;
  sku: string;
  name: string;
  nameKm?: string;
  categoryId: ID;
  unit: string; // "pcs", "kg", "case", "bottle"
  sellingPrice: number;
  costPrice: number;
  currency: Currency;
  reorderLevel: number;
  status: "active" | "inactive";
  barcode?: string;
  /** Current on-hand quantity per branch id. */
  stock: Record<ID, number>;
  createdAt: ISODateTime;
}

export type StockMovementType =
  | "initial"
  | "sale"
  | "increase"
  | "decrease"
  | "correction"
  | "import"
  | "invoice";

export interface StockMovement {
  id: ID;
  itemId: ID;
  branchId: ID;
  date: ISODate;
  type: StockMovementType;
  quantityChange: number; // signed
  resultingQuantity: number;
  reason?: string;
  reference?: string; // sale/invoice/adjustment id
  createdBy: string;
  createdAt: ISODateTime;
}

export type StockAdjustmentType = "increase" | "decrease" | "correction";

export interface StockAdjustment {
  id: ID;
  number: string;
  itemId: ID;
  branchId: ID;
  date: ISODate;
  type: StockAdjustmentType;
  /** For increase/decrease: positive qty. For correction: the counted (new) quantity. */
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  note?: string;
  createdBy: string;
  createdAt: ISODateTime;
}

export type SaleChannel = "walk_in" | "wholesale" | "shopify";

export interface Sale {
  id: ID;
  number: string;
  date: ISODate;
  branchId: ID;
  channel: SaleChannel;
  customerId?: ID; // undefined => anonymous walk-in
  lines: LineItem[]; // itemId always set for sales
  currency: Currency;
  discount: number;
  paymentMethod: PaymentMethod;
  accountId: ID;
  transactionId: ID;
  createdBy: string;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Imports                                                             */
/* ------------------------------------------------------------------ */

export type ImportStatus = "processing" | "completed" | "failed" | "needs_review";

export type ImportKind =
  | "bank_statement"
  | "receipt"
  | "supplier_bill"
  | "payment_screenshot"
  | "item_catalog"
  | "spreadsheet";

export interface ImportBatch {
  id: ID;
  kind: ImportKind;
  fileName: string;
  fileSize: number;
  bank?: BankProvider;
  accountId?: ID;
  branchId: ID;
  status: ImportStatus;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  reviewRows: number;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
  createdBy: string;
  errorMessage?: string;
  /** Ids of records created by this import. */
  createdRecordIds: ID[];
}

/* ------------------------------------------------------------------ */
/* Reconciliation & till                                               */
/* ------------------------------------------------------------------ */

export type ReconStatus = "in_progress" | "submitted" | "signed_off" | "returned";
export type ReconLineState = "matched" | "suggested" | "unmatched" | "discrepancy";

export interface ReconLine {
  id: ID;
  date: ISODate;
  description: string;
  amount: number; // signed: + money in, - money out
  reference?: string;
  state: ReconLineState;
  /** Matched or suggested ledger transaction. */
  transactionId?: ID;
  matchConfidence?: number;
  note?: string;
}

export interface Reconciliation {
  id: ID;
  accountId: ID;
  branchId: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  statementOpening: number;
  statementClosing: number;
  status: ReconStatus;
  lines: ReconLine[];
  submittedBy?: string;
  submittedAt?: ISODateTime;
  reviewedBy?: string;
  reviewedAt?: ISODateTime;
  reviewNote?: string;
  history: { at: ISODateTime; by: string; action: string; note?: string }[];
}

export type TillStatus = "draft" | "submitted" | "signed_off" | "returned";

export interface TillDenomination {
  currency: Currency;
  value: number;
  count: number;
}

export interface TillSession {
  id: ID;
  branchId: ID;
  date: ISODate;
  shift: "morning" | "evening" | "full_day";
  openingFloatUSD: number;
  openingFloatKHR: number;
  expectedUSD: number;
  expectedKHR: number;
  countedUSD: number;
  countedKHR: number;
  denominations: TillDenomination[];
  status: TillStatus;
  submittedBy: string;
  submittedAt?: ISODateTime;
  reviewedBy?: string;
  reviewedAt?: ISODateTime;
  reviewNote?: string;
  notes?: string;
  history: { at: ISODateTime; by: string; action: string; note?: string }[];
}

/* ------------------------------------------------------------------ */
/* Notifications & integrations                                        */
/* ------------------------------------------------------------------ */

export type NotificationCategory = "financial" | "system";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: ID;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  createdAt: ISODateTime;
  read: boolean;
  href?: string;
  branchId?: ID;
  /** Dedupe key so derived alerts (e.g. low stock for item X) aren't repeated. */
  key?: string;
}

export interface NotificationPreferences {
  channels: { inApp: boolean; email: boolean; telegram: boolean };
  events: Record<
    "overdue_invoices" | "upcoming_bills" | "low_stock" | "import_review" | "reconciliation" | "till" | "reports" | "system",
    boolean
  >;
  digest: "off" | "daily" | "weekly";
}

export type IntegrationId = "shopify" | "webill365" | "telegram";
export type IntegrationStatus = "connected" | "disconnected" | "syncing" | "error";

export interface IntegrationSyncRun {
  id: ID;
  startedAt: ISODateTime;
  finishedAt?: ISODateTime;
  status: "success" | "failed" | "running";
  recordsProcessed: number;
  message: string;
}

export interface Integration {
  id: IntegrationId;
  name: string;
  description: string;
  status: IntegrationStatus;
  connectedAt?: ISODateTime;
  lastSyncAt?: ISODateTime;
  config: Record<string, string | boolean>;
  history: IntegrationSyncRun[];
  errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/* AI: advisor, reports, forecasting                                   */
/* ------------------------------------------------------------------ */

export interface AdvisorMessage {
  id: ID;
  role: "user" | "assistant";
  content: string;
  createdAt: ISODateTime;
  /** Structured blocks rendered under assistant text. */
  blocks?: AdvisorBlock[];
  followUps?: string[];
  references?: { label: string; href: string }[];
}

export type AdvisorBlock =
  | { kind: "kpis"; items: { label: string; value: string; delta?: string; tone?: "positive" | "negative" | "neutral" }[] }
  | { kind: "table"; columns: string[]; rows: (string | number)[][] }
  | { kind: "bar"; title: string; data: { label: string; value: number }[]; currency: Currency }
  | { kind: "line"; title: string; data: { label: string; a: number; b?: number }[]; series: [string, string?]; currency: Currency };

export interface AdvisorConversation {
  id: ID;
  title: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  messages: AdvisorMessage[];
}

export type ReportStatus = "complete" | "incomplete" | "generating" | "failed";

export interface MonthlyReport {
  id: ID;
  month: string; // "yyyy-MM"
  status: ReportStatus;
  generatedAt?: ISODateTime;
  /** Reasons a report is incomplete (e.g. unreconciled accounts). */
  missing: string[];
  branchScope: "all" | ID;
}

export interface WhatIfScenario {
  id: ID;
  name: string;
  createdAt: ISODateTime;
  horizonDays: number;
  newBranch: { enabled: boolean; monthlyRevenue: number; monthlyCost: number; setupCost: number; openingInDays: number };
  supplierIncrease: { enabled: boolean; percent: number };
  salesDecrease: { enabled: boolean; percent: number };
}

export interface TargetBudget {
  id: ID;
  name: string;
  scenarioId: ID;
  createdAt: ISODateTime;
  periodDays: number;
  revenueTarget: number;
  expenseLimit: number;
  netTarget: number;
  currency: Currency;
}

/* ------------------------------------------------------------------ */
/* UI preferences                                                      */
/* ------------------------------------------------------------------ */

export type DashboardSectionId = "kpis" | "health" | "charts" | "alerts" | "transactions";

export interface DashboardLayout {
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
}
