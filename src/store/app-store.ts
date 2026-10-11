"use client";

/**
 * Domain data store for the frontend demo.
 *
 * All mock "backend" state lives here and is persisted to localStorage, so
 * actions update every dependent view (dashboard KPIs, lists, detail pages).
 * Components should not call these actions directly for user-facing mutations —
 * go through `@/lib/api` services, which add latency/loading semantics and are
 * the seam where real HTTP calls to Spring Boot / FastAPI will be plugged in.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type {
  AdvisorConversation,
  AdvisorMessage,
  AppNotification,
  Bill,
  Branch,
  BranchManager,
  Business,
  Category,
  Customer,
  FinancialAccount,
  ID,
  ImportBatch,
  Integration,
  IntegrationId,
  Invoice,
  ISODate,
  Item,
  LineItem,
  MonthlyReport,
  NotificationPreferences,
  Payment,
  PaymentMethod,
  PlannedPurchase,
  ReconLine,
  Reconciliation,
  Sale,
  SaleChannel,
  StockAdjustment,
  StockAdjustmentType,
  StockMovement,
  TargetBudget,
  TillDenomination,
  TillSession,
  Transaction,
  User,
  WhatIfScenario,
  Currency,
} from "@/types";
import { createSeedData, type SeedData } from "@/data/mock/seed";
import { nowISO, today } from "@/lib/date";
import { invoiceTotals, billTotals, nextNumber, documentTotals } from "@/lib/domain";
import { roundMoney } from "@/lib/currency";
import { useSessionStore } from "./session-store";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

let counter = 0;
export function uid(prefix: string): ID {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function actorName(s: SeedData): string {
  const userId = useSessionStore.getState().userId;
  return s.users.find((u) => u.id === userId)?.name ?? "Demo user";
}

/* ------------------------------------------------------------------ */
/* Input types                                                         */
/* ------------------------------------------------------------------ */

export type NewTransaction = Pick<Transaction, "date" | "type" | "amount" | "currency" | "accountId" | "branchId" | "description"> &
  Partial<Pick<Transaction, "toAccountId" | "categoryId" | "counterparty" | "reference" | "source" | "sourceId" | "status" | "suggestedCategoryId" | "suggestionConfidence">>;

export type NewInvoice = Pick<Invoice, "customerId" | "branchId" | "issueDate" | "dueDate" | "currency" | "lines" | "discount" | "taxRate"> &
  Partial<Pick<Invoice, "notes" | "source" | "plannedPurchaseId">> & { send?: boolean };

export interface NewPayment {
  date: ISODate;
  amount: number;
  method: PaymentMethod;
  accountId: ID;
  reference?: string;
  note?: string;
}

export type NewBill = Pick<Bill, "supplier" | "branchId" | "categoryId" | "issueDate" | "dueDate" | "currency" | "amount" | "description"> &
  Partial<Pick<Bill, "source">> & { draft?: boolean };

export type NewItem = Omit<Item, "id" | "createdAt" | "stock"> & { initialStock: Record<ID, number> };

export interface NewSale {
  date: ISODate;
  branchId: ID;
  channel: SaleChannel;
  customerId?: ID;
  lines: LineItem[];
  currency: Currency;
  discount: number;
  paymentMethod: PaymentMethod;
  accountId: ID;
}

export interface NewAdjustment {
  itemId: ID;
  branchId: ID;
  date: ISODate;
  type: StockAdjustmentType;
  /** increase/decrease: positive quantity; correction: counted quantity */
  quantity: number;
  reason: string;
  note?: string;
}

export interface StatementRowInput {
  date: ISODate;
  description: string;
  amount: number; // signed
  reference?: string;
  counterparty?: string;
  categoryId?: ID; // confirmed category; undefined => needs review
  suggestedCategoryId?: ID;
  suggestionConfidence?: number;
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface AppState extends SeedData {
  /* business */
  updateBusiness: (patch: Partial<Business>) => void;
  updateUser: (id: ID, patch: Partial<Omit<User, "id" | "role">>) => void;

  /* branches & managers */
  createBranch: (b: Omit<Branch, "id" | "isMain"> & { isMain?: boolean }) => Branch;
  updateBranch: (id: ID, patch: Partial<Branch>) => void;
  inviteManager: (m: Pick<BranchManager, "name" | "email" | "phone" | "branchId">) => BranchManager;
  updateManager: (id: ID, patch: Partial<BranchManager>) => void;
  resendInvite: (id: ID) => void;
  revokeInvite: (id: ID) => void;
  acceptInvitation: (id: ID) => void;

  /* categories & accounts */
  createCategory: (c: Omit<Category, "id">) => Category;
  updateCategory: (id: ID, patch: Partial<Category>) => void;
  deleteCategory: (id: ID) => boolean;
  createAccount: (a: Omit<FinancialAccount, "id" | "status">) => FinancialAccount;
  updateAccount: (id: ID, patch: Partial<FinancialAccount>) => void;

  /* transactions */
  addTransaction: (t: NewTransaction) => Transaction;
  updateTransaction: (id: ID, patch: Partial<Transaction>) => void;
  deleteTransaction: (id: ID) => boolean;
  /** Confirm a category (e.g. accept AI suggestion) and post the transaction. */
  categorizeTransactions: (ids: ID[], categoryId?: ID) => void;

  /* customers */
  createCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: ID, patch: Partial<Customer>) => void;

  /* invoices */
  createInvoice: (inv: NewInvoice) => Invoice;
  updateDraftInvoice: (id: ID, patch: Partial<NewInvoice>) => void;
  sendInvoice: (id: ID) => void;
  cancelInvoice: (id: ID) => void;
  recordInvoicePayment: (id: ID, p: NewPayment) => Payment;

  /* planned purchases */
  createPlannedPurchase: (pp: Pick<PlannedPurchase, "customerId" | "branchId" | "createdDate" | "validUntil" | "currency" | "lines" | "discount"> & Partial<Pick<PlannedPurchase, "notes" | "expectedDeliveryDate">> & { send?: boolean }) => PlannedPurchase;
  updatePlannedPurchase: (id: ID, patch: Partial<PlannedPurchase>) => void;
  setPlannedPurchaseStatus: (id: ID, status: "sent" | "accepted" | "rejected", note?: string) => void;
  convertPlannedPurchase: (id: ID, opts: { issueDate: ISODate; dueDate: ISODate; taxRate: number }) => Invoice;

  /* bills */
  createBill: (b: NewBill) => Bill;
  updateBill: (id: ID, patch: Partial<Bill>) => void;
  approveBill: (id: ID) => void;
  voidBill: (id: ID) => void;
  recordBillPayment: (id: ID, p: NewPayment) => Payment;

  /* inventory */
  createItem: (i: NewItem) => Item;
  updateItem: (id: ID, patch: Partial<Omit<Item, "stock">>) => void;
  bulkImportItems: (rows: NewItem[]) => Item[];
  createSale: (s: NewSale) => Sale;
  createStockAdjustment: (a: NewAdjustment) => StockAdjustment;

  /* imports */
  createImportBatch: (b: Omit<ImportBatch, "id" | "createdAt" | "createdBy" | "createdRecordIds">) => ImportBatch;
  updateImportBatch: (id: ID, patch: Partial<ImportBatch>) => void;
  /** Post reviewed statement rows as transactions for an account. Returns created ids. */
  commitStatementRows: (batchId: ID, accountId: ID, rows: StatementRowInput[]) => ID[];

  /* reconciliation */
  createReconciliation: (r: Pick<Reconciliation, "accountId" | "periodStart" | "periodEnd" | "statementOpening" | "statementClosing" | "lines">) => Reconciliation;
  updateReconLine: (reconId: ID, lineId: ID, patch: Partial<ReconLine>) => void;
  /** Create a ledger transaction from an unmatched statement line and match it. */
  createTransactionFromReconLine: (reconId: ID, lineId: ID, categoryId: ID) => void;
  submitReconciliation: (id: ID, note?: string) => void;
  signOffReconciliation: (id: ID, note?: string) => void;
  returnReconciliation: (id: ID, note: string) => void;

  /* till */
  saveTillSession: (t: Omit<TillSession, "id" | "history" | "submittedBy" | "status"> & { id?: ID; submit: boolean }) => TillSession;
  signOffTill: (id: ID, note?: string) => void;
  returnTill: (id: ID, note: string) => void;

  /* notifications */
  pushNotification: (n: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: ID, read?: boolean) => void;
  markAllNotificationsRead: (category?: AppNotification["category"]) => void;
  updateNotificationPreferences: (p: NotificationPreferences) => void;

  /* integrations */
  updateIntegration: (id: IntegrationId, patch: Partial<Integration>) => void;
  addIntegrationRun: (id: IntegrationId, run: Integration["history"][number]) => void;

  /* AI */
  saveConversation: (c: AdvisorConversation) => void;
  appendAdvisorMessage: (conversationId: ID, m: AdvisorMessage) => void;
  deleteConversation: (id: ID) => void;
  upsertReport: (r: MonthlyReport) => void;
  saveScenario: (s: WhatIfScenario) => void;
  deleteScenario: (id: ID) => void;
  saveTargetBudget: (b: TargetBudget) => void;
  deleteTargetBudget: (id: ID) => void;

  /* demo */
  resetDemoData: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    immer((set, get) => {
      /** Apply a stock change, record movement, and raise a low-stock notification if needed. */
      const applyStock = (
        s: AppState,
        itemId: ID,
        branchId: ID,
        change: number,
        type: StockMovement["type"],
        date: ISODate,
        reason: string,
        reference?: string,
      ) => {
        const item = s.items.find((i) => i.id === itemId);
        if (!item) return;
        const prev = item.stock[branchId] ?? 0;
        const next = prev + change;
        item.stock[branchId] = next;
        s.stockMovements.push({
          id: uid("mv"),
          itemId,
          branchId,
          date,
          type,
          quantityChange: change,
          resultingQuantity: next,
          reason,
          reference,
          createdBy: actorName(s),
          createdAt: nowISO(),
        });
        if (next <= item.reorderLevel && change < 0 && item.status === "active") {
          const key = `lowstock:${itemId}:${branchId}`;
          const branch = s.branches.find((b) => b.id === branchId);
          const existing = s.notifications.find((n) => n.key === key && !n.read);
          if (!existing) {
            s.notifications.unshift({
              id: uid("ntf"),
              category: "financial",
              severity: next <= 0 ? "error" : "warning",
              title: `${next <= 0 ? "Out of stock" : "Low stock"}: ${item.name}`,
              body: `${branch?.name ?? "Branch"} has ${next} ${item.unit} left (reorder level ${item.reorderLevel}).`,
              createdAt: nowISO(),
              read: false,
              href: `/items/${item.id}`,
              branchId,
              key,
            });
          }
        }
      };

      const insertTx = (s: AppState, t: NewTransaction): Transaction => {
        const tx: Transaction = {
          id: uid("tx"),
          source: "manual",
          status: t.categoryId || t.type === "transfer" ? "posted" : "needs_review",
          reconciled: false,
          createdBy: actorName(s),
          createdAt: nowISO(),
          ...t,
          amount: roundMoney(t.amount, t.currency),
        };
        s.transactions.push(tx);
        return tx;
      };

      return {
        ...createSeedData(),

        /* ---------------- business ---------------- */
        updateBusiness: (patch) =>
          set((s) => {
            if ("khrPerUsd" in patch) s.business.khrRateUpdatedAt = nowISO();
            Object.assign(s.business, patch);
          }),

        updateUser: (id, patch) =>
          set((s) => {
            const u = s.users.find((x) => x.id === id);
            if (u) Object.assign(u, patch);
          }),

        /* ---------------- branches & managers ---------------- */
        createBranch: (b) => {
          const branch: Branch = { id: uid("br"), isMain: false, ...b };
          set((s) => {
            s.branches.push(branch);
            for (const item of s.items) item.stock[branch.id] = 0;
            s.accounts.push({
              id: uid("acc"),
              name: `${branch.name} Cash Drawer`,
              type: "cash",
              provider: "Cash",
              accountNumber: "Till 1",
              currency: "USD",
              branchId: branch.id,
              openingBalance: 0,
              openingDate: today(),
              status: "active",
            });
          });
          return branch;
        },
        updateBranch: (id, patch) =>
          set((s) => {
            const b = s.branches.find((x) => x.id === id);
            if (b) Object.assign(b, patch);
          }),
        inviteManager: (m) => {
          const mgr: BranchManager = { id: uid("mgr"), status: "invited", invitedAt: nowISO(), mustChangePassword: true, ...m };
          set((s) => {
            s.managers.push(mgr);
            const br = s.branches.find((b) => b.id === m.branchId);
            if (br) br.managerId = mgr.id;
            s.notifications.unshift({ id: uid("ntf"), category: "system", severity: "info", title: "Branch manager invitation sent", body: `${m.name} was invited to manage ${br?.name ?? "a branch"}. The invitation link expires in 7 days.`, createdAt: nowISO(), read: false, href: "/branch-managers" });
          });
          return mgr;
        },
        updateManager: (id, patch) =>
          set((s) => {
            const m = s.managers.find((x) => x.id === id);
            if (!m) return;
            if (patch.branchId && patch.branchId !== m.branchId) {
              const oldB = s.branches.find((b) => b.id === m.branchId);
              if (oldB?.managerId === id) oldB.managerId = undefined;
              const newB = s.branches.find((b) => b.id === patch.branchId);
              if (newB) newB.managerId = id;
            }
            Object.assign(m, patch);
          }),
        resendInvite: (id) =>
          set((s) => {
            const m = s.managers.find((x) => x.id === id);
            if (m) m.invitedAt = nowISO();
          }),
        revokeInvite: (id) =>
          set((s) => {
            const m = s.managers.find((x) => x.id === id);
            if (!m) return;
            const br = s.branches.find((b) => b.managerId === id);
            if (br) br.managerId = undefined;
            s.managers = s.managers.filter((x) => x.id !== id);
          }),
        acceptInvitation: (id) =>
          set((s) => {
            const m = s.managers.find((x) => x.id === id);
            if (!m) return;
            m.status = "active";
            m.joinedAt = nowISO();
            m.lastActiveAt = nowISO();
            m.mustChangePassword = false;
          }),

        /* ---------------- categories & accounts ---------------- */
        createCategory: (c) => {
          const cat: Category = { id: uid("cat"), ...c };
          set((s) => void s.categories.push(cat));
          return cat;
        },
        updateCategory: (id, patch) =>
          set((s) => {
            const c = s.categories.find((x) => x.id === id);
            if (c) Object.assign(c, patch);
          }),
        deleteCategory: (id) => {
          const s = get();
          const inUse = s.transactions.some((t) => t.categoryId === id) || s.items.some((i) => i.categoryId === id) || s.bills.some((b) => b.categoryId === id);
          if (inUse || s.categories.find((c) => c.id === id)?.isSystem) return false;
          set((st) => {
            st.categories = st.categories.filter((c) => c.id !== id);
          });
          return true;
        },
        createAccount: (a) => {
          const acc: FinancialAccount = { id: uid("acc"), status: "active", ...a };
          set((s) => void s.accounts.push(acc));
          return acc;
        },
        updateAccount: (id, patch) =>
          set((s) => {
            const a = s.accounts.find((x) => x.id === id);
            if (a) Object.assign(a, patch);
          }),

        /* ---------------- transactions ---------------- */
        addTransaction: (t) => {
          let tx!: Transaction;
          set((s) => {
            tx = insertTx(s, t);
          });
          return tx;
        },
        updateTransaction: (id, patch) =>
          set((s) => {
            const t = s.transactions.find((x) => x.id === id);
            if (t) Object.assign(t, patch);
          }),
        deleteTransaction: (id) => {
          const t = get().transactions.find((x) => x.id === id);
          if (!t || t.source !== "manual" || t.reconciled) return false;
          set((s) => {
            s.transactions = s.transactions.filter((x) => x.id !== id);
          });
          return true;
        },
        categorizeTransactions: (ids, categoryId) =>
          set((s) => {
            for (const t of s.transactions) {
              if (!ids.includes(t.id)) continue;
              const cat = categoryId ?? t.suggestedCategoryId;
              if (!cat) continue;
              t.categoryId = cat;
              t.status = "posted";
            }
            // Resolve the import batch once nothing remains for review
            for (const b of s.imports) {
              if (b.status !== "needs_review") continue;
              const remaining = s.transactions.filter((t) => b.createdRecordIds.includes(t.id) && t.status === "needs_review").length;
              b.reviewRows = remaining;
              if (remaining === 0) {
                b.status = "completed";
                for (const n of s.notifications) if (n.key === `import:${b.id}`) n.read = true;
              }
            }
          }),

        /* ---------------- customers ---------------- */
        createCustomer: (c) => {
          const cust: Customer = { id: uid("cus"), createdAt: nowISO(), ...c };
          set((s) => void s.customers.push(cust));
          return cust;
        },
        updateCustomer: (id, patch) =>
          set((s) => {
            const c = s.customers.find((x) => x.id === id);
            if (c) Object.assign(c, patch);
          }),

        /* ---------------- invoices ---------------- */
        createInvoice: ({ send, ...inv }) => {
          const s0 = get();
          const invoice: Invoice = {
            id: uid("inv"),
            number: nextNumber("INV", s0.invoices.map((i) => i.number)),
            baseStatus: "draft",
            payments: [],
            source: "manual",
            createdAt: nowISO(),
            ...inv,
          };
          set((s) => {
            s.invoices.push(invoice);
          });
          if (send) get().sendInvoice(invoice.id);
          return get().invoices.find((i) => i.id === invoice.id)!;
        },
        updateDraftInvoice: (id, patch) =>
          set((s) => {
            const inv = s.invoices.find((x) => x.id === id);
            if (!inv || inv.baseStatus !== "draft") return;
            const { send: _send, ...rest } = patch;
            void _send;
            Object.assign(inv, rest);
          }),
        sendInvoice: (id) =>
          set((s) => {
            const inv = s.invoices.find((x) => x.id === id);
            if (!inv || inv.baseStatus !== "draft") return;
            inv.baseStatus = "sent";
            inv.sentAt = nowISO();
            // Delivering an invoice ships stock out of the branch
            for (const l of inv.lines) if (l.itemId) applyStock(s, l.itemId, inv.branchId, -l.quantity, "invoice", inv.issueDate, `Invoice ${inv.number}`, inv.number);
          }),
        cancelInvoice: (id) =>
          set((s) => {
            const inv = s.invoices.find((x) => x.id === id);
            if (!inv || inv.payments.length > 0) return;
            const wasSent = inv.baseStatus === "sent";
            inv.baseStatus = "cancelled";
            if (wasSent) for (const l of inv.lines) if (l.itemId) applyStock(s, l.itemId, inv.branchId, l.quantity, "invoice", today(), `Invoice ${inv.number} cancelled – stock returned`, inv.number);
          }),
        recordInvoicePayment: (id, p) => {
          let payment!: Payment;
          set((s) => {
            const inv = s.invoices.find((x) => x.id === id);
            if (!inv) return;
            const { balance } = invoiceTotals(inv);
            const amount = roundMoney(Math.min(p.amount, balance), inv.currency);
            const cust = s.customers.find((c) => c.id === inv.customerId);
            const tx = insertTx(s, {
              date: p.date,
              type: "income",
              amount,
              currency: inv.currency,
              accountId: p.accountId,
              categoryId: "cat_wholesale",
              branchId: inv.branchId,
              description: `Payment for ${inv.number}`,
              counterparty: cust?.name,
              source: "invoice_payment",
              sourceId: inv.id,
              reference: p.reference ?? inv.number,
            });
            payment = { id: uid("pay"), date: p.date, amount, method: p.method, accountId: p.accountId, transactionId: tx.id, reference: p.reference, note: p.note };
            inv.payments.push(payment);
            for (const n of s.notifications) if (n.key === `overdue:${inv.id}` && invoiceTotals(inv).balance <= 0) n.read = true;
          });
          return payment;
        },

        /* ---------------- planned purchases ---------------- */
        createPlannedPurchase: ({ send, ...pp }) => {
          const s0 = get();
          const rec: PlannedPurchase = {
            id: uid("pp"),
            number: nextNumber("PP", s0.plannedPurchases.map((p) => p.number)),
            status: send ? "sent" : "draft",
            history: [{ at: nowISO(), status: "draft" }, ...(send ? [{ at: nowISO(), status: "sent" as const }] : [])],
            ...pp,
          };
          set((s) => void s.plannedPurchases.push(rec));
          return rec;
        },
        updatePlannedPurchase: (id, patch) =>
          set((s) => {
            const p = s.plannedPurchases.find((x) => x.id === id);
            if (p) Object.assign(p, patch);
          }),
        setPlannedPurchaseStatus: (id, status, note) =>
          set((s) => {
            const p = s.plannedPurchases.find((x) => x.id === id);
            if (!p || p.status === "converted") return;
            p.status = status;
            p.history.push({ at: nowISO(), status, note });
          }),
        convertPlannedPurchase: (id, opts) => {
          const pp = get().plannedPurchases.find((x) => x.id === id)!;
          const inv = get().createInvoice({
            customerId: pp.customerId,
            branchId: pp.branchId,
            currency: pp.currency,
            lines: pp.lines.map((l) => ({ ...l, id: uid("ln") })),
            discount: pp.discount,
            taxRate: opts.taxRate,
            issueDate: opts.issueDate,
            dueDate: opts.dueDate,
            notes: pp.notes,
            source: "planned_purchase",
            plannedPurchaseId: pp.id,
          });
          set((s) => {
            const p = s.plannedPurchases.find((x) => x.id === id)!;
            p.status = "converted";
            p.convertedInvoiceId = inv.id;
            p.history.push({ at: nowISO(), status: "converted", note: `Converted to ${inv.number}` });
          });
          return inv;
        },

        /* ---------------- bills ---------------- */
        createBill: ({ draft, ...b }) => {
          const s0 = get();
          const bill: Bill = {
            id: uid("bill"),
            number: nextNumber("BILL", s0.bills.map((x) => x.number)),
            baseStatus: draft ? "draft" : "open",
            payments: [],
            source: "manual",
            createdAt: nowISO(),
            ...b,
          };
          set((s) => void s.bills.push(bill));
          return bill;
        },
        updateBill: (id, patch) =>
          set((s) => {
            const b = s.bills.find((x) => x.id === id);
            if (b) Object.assign(b, patch);
          }),
        approveBill: (id) =>
          set((s) => {
            const b = s.bills.find((x) => x.id === id);
            if (b && b.baseStatus === "draft") b.baseStatus = "open";
          }),
        voidBill: (id) =>
          set((s) => {
            const b = s.bills.find((x) => x.id === id);
            if (b && b.payments.length === 0) b.baseStatus = "void";
          }),
        recordBillPayment: (id, p) => {
          let payment!: Payment;
          set((s) => {
            const bill = s.bills.find((x) => x.id === id);
            if (!bill) return;
            const amount = roundMoney(Math.min(p.amount, billTotals(bill).balance), bill.currency);
            const tx = insertTx(s, {
              date: p.date,
              type: "expense",
              amount,
              currency: bill.currency,
              accountId: p.accountId,
              categoryId: bill.categoryId,
              branchId: bill.branchId,
              description: `Payment for ${bill.number} – ${bill.supplier}`,
              counterparty: bill.supplier,
              source: "bill_payment",
              sourceId: bill.id,
              reference: p.reference ?? bill.number,
            });
            payment = { id: uid("pay"), date: p.date, amount, method: p.method, accountId: p.accountId, transactionId: tx.id, reference: p.reference, note: p.note };
            bill.payments.push(payment);
          });
          return payment;
        },

        /* ---------------- inventory ---------------- */
        createItem: ({ initialStock, ...i }) => {
          const item: Item = { id: uid("itm"), createdAt: nowISO(), stock: {}, ...i };
          set((s) => {
            for (const b of s.branches) item.stock[b.id] = 0;
            s.items.push(item);
            for (const [branchId, qty] of Object.entries(initialStock)) {
              if (qty > 0) applyStock(s, item.id, branchId, qty, "initial", today(), "Initial stock");
            }
          });
          return get().items.find((x) => x.id === item.id)!;
        },
        updateItem: (id, patch) =>
          set((s) => {
            const it = s.items.find((x) => x.id === id);
            if (it) Object.assign(it, patch);
          }),
        bulkImportItems: (rows) => rows.map((r) => get().createItem(r)),
        createSale: (input) => {
          const s0 = get();
          const saleId = uid("sale");
          const number = nextNumber("SL", s0.sales.map((x) => x.number));
          const total = documentTotals(input.lines, input.discount, 0, input.currency).total;
          let sale!: Sale;
          set((s) => {
            const cust = input.customerId ? s.customers.find((c) => c.id === input.customerId) : undefined;
            const tx = insertTx(s, {
              date: input.date,
              type: "income",
              amount: total,
              currency: input.currency,
              accountId: input.accountId,
              categoryId: "cat_sales",
              branchId: input.branchId,
              description: `${input.channel === "walk_in" ? "Walk-in sale" : "Sale"} ${number}`,
              counterparty: cust?.name ?? "Walk-in customer",
              source: input.channel === "walk_in" ? "walk_in_sale" : "item_sale",
              sourceId: saleId,
              reference: number,
            });
            sale = { id: saleId, number, ...input, transactionId: tx.id, createdBy: actorName(s), createdAt: nowISO() };
            s.sales.push(sale);
            for (const l of input.lines) if (l.itemId) applyStock(s, l.itemId, input.branchId, -l.quantity, "sale", input.date, "Item sale", number);
          });
          return sale;
        },
        createStockAdjustment: (a) => {
          const s0 = get();
          const item = s0.items.find((i) => i.id === a.itemId)!;
          const prev = item.stock[a.branchId] ?? 0;
          const newQty = a.type === "increase" ? prev + a.quantity : a.type === "decrease" ? prev - a.quantity : a.quantity;
          const adj: StockAdjustment = {
            id: uid("adj"),
            number: nextNumber("ADJ", s0.stockAdjustments.map((x) => x.number)),
            ...a,
            previousQuantity: prev,
            newQuantity: newQty,
            createdBy: actorName(s0),
            createdAt: nowISO(),
          };
          set((s) => {
            s.stockAdjustments.push(adj);
            applyStock(s, a.itemId, a.branchId, newQty - prev, a.type, a.date, a.reason, adj.number);
          });
          return adj;
        },

        /* ---------------- imports ---------------- */
        createImportBatch: (b) => {
          const batch: ImportBatch = { id: uid("imp"), createdAt: nowISO(), createdBy: actorName(get()), createdRecordIds: [], ...b };
          set((s) => void s.imports.unshift(batch));
          return batch;
        },
        updateImportBatch: (id, patch) =>
          set((s) => {
            const b = s.imports.find((x) => x.id === id);
            if (b) Object.assign(b, patch);
          }),
        commitStatementRows: (batchId, accountId, rows) => {
          const ids: ID[] = [];
          set((s) => {
            const acc = s.accounts.find((a) => a.id === accountId)!;
            for (const r of rows) {
              const tx = insertTx(s, {
                date: r.date,
                type: r.amount >= 0 ? "income" : "expense",
                amount: Math.abs(r.amount),
                currency: acc.currency,
                accountId,
                branchId: acc.branchId,
                description: r.description,
                counterparty: r.counterparty,
                reference: r.reference,
                categoryId: r.categoryId,
                suggestedCategoryId: r.suggestedCategoryId,
                suggestionConfidence: r.suggestionConfidence,
                source: "statement_import",
                sourceId: batchId,
              });
              ids.push(tx.id);
            }
            const batch = s.imports.find((b) => b.id === batchId);
            if (batch) {
              batch.createdRecordIds.push(...ids);
              const review = rows.filter((r) => !r.categoryId).length;
              batch.reviewRows = review;
              batch.importedRows = rows.length;
              batch.status = review > 0 ? "needs_review" : "completed";
              batch.completedAt = nowISO();
              if (review > 0)
                s.notifications.unshift({ id: uid("ntf"), category: "financial", severity: "warning", title: `${review} imported transactions need review`, body: `${batch.fileName} has transactions awaiting category confirmation.`, createdAt: nowISO(), read: false, href: "/banking/uncategorized", key: `import:${batchId}` });
            }
          });
          return ids;
        },

        /* ---------------- reconciliation ---------------- */
        createReconciliation: (r) => {
          const s0 = get();
          const acc = s0.accounts.find((a) => a.id === r.accountId)!;
          const rec: Reconciliation = { id: uid("rec"), branchId: acc.branchId, status: "in_progress", history: [{ at: nowISO(), by: actorName(s0), action: "Started reconciliation" }], ...r };
          set((s) => void s.reconciliations.unshift(rec));
          return rec;
        },
        updateReconLine: (reconId, lineId, patch) =>
          set((s) => {
            const r = s.reconciliations.find((x) => x.id === reconId);
            const l = r?.lines.find((x) => x.id === lineId);
            if (l) Object.assign(l, patch);
          }),
        createTransactionFromReconLine: (reconId, lineId, categoryId) =>
          set((s) => {
            const r = s.reconciliations.find((x) => x.id === reconId);
            const l = r?.lines.find((x) => x.id === lineId);
            if (!r || !l) return;
            const acc = s.accounts.find((a) => a.id === r.accountId)!;
            const tx = insertTx(s, { date: l.date, type: l.amount >= 0 ? "income" : "expense", amount: Math.abs(l.amount), currency: acc.currency, accountId: acc.id, branchId: acc.branchId, categoryId, description: l.description, reference: l.reference, source: "statement_import" });
            l.transactionId = tx.id;
            l.state = "matched";
            l.matchConfidence = 1;
            l.note = "Ledger entry created during reconciliation";
          }),
        submitReconciliation: (id, note) =>
          set((s) => {
            const r = s.reconciliations.find((x) => x.id === id);
            if (!r) return;
            r.status = "submitted";
            r.submittedBy = actorName(s);
            r.submittedAt = nowISO();
            r.history.push({ at: nowISO(), by: actorName(s), action: "Submitted for owner sign-off", note });
            const acc = s.accounts.find((a) => a.id === r.accountId);
            s.notifications.unshift({ id: uid("ntf"), category: "financial", severity: "info", title: `Reconciliation submitted – ${acc?.name ?? "account"}`, body: `${actorName(s)} submitted a reconciliation for review.`, createdAt: nowISO(), read: false, href: `/reconciliation/${r.id}`, branchId: r.branchId });
          }),
        signOffReconciliation: (id, note) =>
          set((s) => {
            const r = s.reconciliations.find((x) => x.id === id);
            if (!r) return;
            r.status = "signed_off";
            r.reviewedBy = actorName(s);
            r.reviewedAt = nowISO();
            r.reviewNote = note;
            r.history.push({ at: nowISO(), by: actorName(s), action: "Signed off", note });
            const matched = new Set(r.lines.filter((l) => l.state === "matched" && l.transactionId).map((l) => l.transactionId));
            for (const t of s.transactions) if (matched.has(t.id)) t.reconciled = true;
            // Signing off may complete the month's report
            const month = r.periodStart.slice(0, 7);
            const rep = s.reports.find((x) => x.month === month);
            if (rep) {
              const acc = s.accounts.find((a) => a.id === r.accountId);
              rep.missing = rep.missing.filter((m) => !acc || !m.startsWith(acc.name));
              if (rep.missing.length === 0 && rep.status === "incomplete") rep.status = "complete";
            }
          }),
        returnReconciliation: (id, note) =>
          set((s) => {
            const r = s.reconciliations.find((x) => x.id === id);
            if (!r) return;
            r.status = "returned";
            r.reviewedBy = actorName(s);
            r.reviewedAt = nowISO();
            r.reviewNote = note;
            r.history.push({ at: nowISO(), by: actorName(s), action: "Returned for correction", note });
          }),

        /* ---------------- till ---------------- */
        saveTillSession: ({ id, submit, ...t }) => {
          let session!: TillSession;
          set((s) => {
            const existing = id ? s.tillSessions.find((x) => x.id === id) : undefined;
            const action = submit ? (existing?.status === "returned" ? "Resubmitted count" : "Submitted count") : "Saved draft";
            if (existing) {
              Object.assign(existing, t);
              existing.status = submit ? "submitted" : "draft";
              existing.submittedBy = actorName(s);
              if (submit) existing.submittedAt = nowISO();
              existing.history.push({ at: nowISO(), by: actorName(s), action });
              session = existing;
            } else {
              session = { id: uid("till"), ...t, status: submit ? "submitted" : "draft", submittedBy: actorName(s), submittedAt: submit ? nowISO() : undefined, history: [{ at: nowISO(), by: actorName(s), action }] };
              s.tillSessions.unshift(session);
            }
            if (submit) {
              const br = s.branches.find((b) => b.id === t.branchId);
              s.notifications.unshift({ id: uid("ntf"), category: "financial", severity: "info", title: `Till count submitted – ${br?.name ?? ""}`, body: `${actorName(s)} submitted the ${t.date} till count for sign-off.`, createdAt: nowISO(), read: false, href: `/till-balancing/${session.id}`, branchId: t.branchId });
            }
          });
          return session;
        },
        signOffTill: (id, note) =>
          set((s) => {
            const t = s.tillSessions.find((x) => x.id === id);
            if (!t) return;
            t.status = "signed_off";
            t.reviewedBy = actorName(s);
            t.reviewedAt = nowISO();
            t.reviewNote = note;
            t.history.push({ at: nowISO(), by: actorName(s), action: "Signed off", note });
          }),
        returnTill: (id, note) =>
          set((s) => {
            const t = s.tillSessions.find((x) => x.id === id);
            if (!t) return;
            t.status = "returned";
            t.reviewedBy = actorName(s);
            t.reviewedAt = nowISO();
            t.reviewNote = note;
            t.history.push({ at: nowISO(), by: actorName(s), action: "Returned for correction", note });
          }),

        /* ---------------- notifications ---------------- */
        pushNotification: (n) =>
          set((s) => {
            if (n.key && s.notifications.some((x) => x.key === n.key && !x.read)) return;
            s.notifications.unshift({ id: uid("ntf"), createdAt: nowISO(), read: false, ...n });
          }),
        markNotificationRead: (id, read = true) =>
          set((s) => {
            const n = s.notifications.find((x) => x.id === id);
            if (n) n.read = read;
          }),
        markAllNotificationsRead: (category) =>
          set((s) => {
            for (const n of s.notifications) if (!category || n.category === category) n.read = true;
          }),
        updateNotificationPreferences: (p) => set((s) => void (s.notificationPreferences = p)),

        /* ---------------- integrations ---------------- */
        updateIntegration: (id, patch) =>
          set((s) => {
            const i = s.integrations.find((x) => x.id === id);
            if (i) Object.assign(i, patch);
          }),
        addIntegrationRun: (id, run) =>
          set((s) => {
            const i = s.integrations.find((x) => x.id === id);
            if (!i) return;
            const idx = i.history.findIndex((h) => h.id === run.id);
            if (idx >= 0) i.history[idx] = run;
            else i.history.unshift(run);
          }),

        /* ---------------- AI ---------------- */
        saveConversation: (c) =>
          set((s) => {
            const idx = s.conversations.findIndex((x) => x.id === c.id);
            if (idx >= 0) s.conversations[idx] = c;
            else s.conversations.unshift(c);
          }),
        appendAdvisorMessage: (conversationId, m) =>
          set((s) => {
            const c = s.conversations.find((x) => x.id === conversationId);
            if (!c) return;
            c.messages.push(m);
            c.updatedAt = nowISO();
          }),
        deleteConversation: (id) =>
          set((s) => {
            s.conversations = s.conversations.filter((c) => c.id !== id);
          }),
        upsertReport: (r) =>
          set((s) => {
            const idx = s.reports.findIndex((x) => x.id === r.id);
            if (idx >= 0) s.reports[idx] = r;
            else s.reports.push(r);
          }),
        saveScenario: (sc) =>
          set((s) => {
            const idx = s.scenarios.findIndex((x) => x.id === sc.id);
            if (idx >= 0) s.scenarios[idx] = sc;
            else s.scenarios.unshift(sc);
          }),
        deleteScenario: (id) =>
          set((s) => {
            s.scenarios = s.scenarios.filter((x) => x.id !== id);
          }),
        saveTargetBudget: (b) =>
          set((s) => {
            const idx = s.targetBudgets.findIndex((x) => x.id === b.id);
            if (idx >= 0) s.targetBudgets[idx] = b;
            else s.targetBudgets.unshift(b);
          }),
        deleteTargetBudget: (id) =>
          set((s) => {
            s.targetBudgets = s.targetBudgets.filter((x) => x.id !== id);
          }),

        /* ---------------- demo ---------------- */
        resetDemoData: () => set(() => ({ ...createSeedData() })),
      };
    }),
    {
      name: "lv-data",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist only data, never action functions.
      partialize: (s) => {
        const data: Partial<SeedData> = {};
        for (const k of Object.keys(createSeedDataKeys) as (keyof SeedData)[]) (data as Record<string, unknown>)[k] = s[k];
        return data as SeedData;
      },
    },
  ),
);

/** Key list used for persistence partialization. */
const createSeedDataKeys: Record<keyof SeedData, true> = {
  business: true,
  users: true,
  branches: true,
  managers: true,
  categories: true,
  accounts: true,
  transactions: true,
  customers: true,
  invoices: true,
  plannedPurchases: true,
  bills: true,
  items: true,
  stockMovements: true,
  stockAdjustments: true,
  sales: true,
  imports: true,
  reconciliations: true,
  tillSessions: true,
  notifications: true,
  notificationPreferences: true,
  integrations: true,
  reports: true,
  conversations: true,
  scenarios: true,
  targetBudgets: true,
};

/** Helper for TillDenomination totals used by till forms. */
export function denominationTotal(d: TillDenomination[], currency: Currency): number {
  return roundMoney(d.filter((x) => x.currency === currency).reduce((s, x) => s + x.value * x.count, 0), currency);
}
