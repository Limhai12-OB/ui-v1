import type { Customer, ID, Invoice, Payment, PlannedPurchase, Sale } from "@/types";
import type { AppState, NewInvoice, NewPayment, NewSale } from "@/store/app-store";
import { isMock } from "../config";
import { coreApi } from "../http";
import { LATENCY, mockError, simulate } from "../mock";
import { db } from "./_store";
import { invoiceTotals } from "@/lib/domain";

export const customerService = {
  create: (c: Omit<Customer, "id" | "createdAt">) =>
    isMock
      ? simulate(() => {
          if (db().customers.some((x) => x.phone.replace(/\s/g, "") === c.phone.replace(/\s/g, ""))) mockError("A customer with this phone number already exists.", 409, "DUPLICATE");
          return db().createCustomer(c);
        })
      : coreApi.post<Customer>("/customers", c),
  update: (id: ID, patch: Partial<Customer>) => (isMock ? simulate(() => db().updateCustomer(id, patch)) : coreApi.patch<void>(`/customers/${id}`, patch)),
};

export const invoiceService = {
  create: (inv: NewInvoice) =>
    isMock
      ? simulate<Invoice>(() => {
          if (!inv.lines.length) mockError("Add at least one line item.");
          if (inv.dueDate < inv.issueDate) mockError("Due date cannot be before the issue date.");
          return db().createInvoice(inv);
        })
      : coreApi.post<Invoice>("/invoices", inv),
  updateDraft: (id: ID, patch: Partial<NewInvoice>) =>
    isMock
      ? simulate(() => {
          if (db().invoices.find((i) => i.id === id)?.baseStatus !== "draft") mockError("Only draft invoices can be edited.", 409, "CONFLICT");
          db().updateDraftInvoice(id, patch);
          if (patch.send) db().sendInvoice(id);
        })
      : coreApi.patch<void>(`/invoices/${id}`, patch),
  send: (id: ID) => (isMock ? simulate(() => db().sendInvoice(id)) : coreApi.post<void>(`/invoices/${id}/send`)),
  cancel: (id: ID) =>
    isMock
      ? simulate(() => {
          if (db().invoices.find((i) => i.id === id)?.payments.length) mockError("Invoices with recorded payments cannot be cancelled.", 409, "CONFLICT");
          db().cancelInvoice(id);
        })
      : coreApi.post<void>(`/invoices/${id}/cancel`),
  recordPayment: (id: ID, p: NewPayment) =>
    isMock
      ? simulate<Payment>(() => {
          const inv = db().invoices.find((x) => x.id === id);
          if (!inv) mockError("Invoice not found.", 404, "NOT_FOUND");
          const { balance } = invoiceTotals(inv);
          if (p.amount <= 0) mockError("Payment amount must be greater than zero.");
          if (p.amount > balance + 0.0001) mockError("Payment exceeds the outstanding balance.");
          return db().recordInvoicePayment(id, p);
        })
      : coreApi.post<Payment>(`/invoices/${id}/payments`, p),
};

export const plannedPurchaseService = {
  create: (pp: Parameters<AppState["createPlannedPurchase"]>[0]) => (isMock ? simulate<PlannedPurchase>(() => db().createPlannedPurchase(pp)) : coreApi.post<PlannedPurchase>("/planned-purchases", pp)),
  update: (id: ID, patch: Partial<PlannedPurchase>) => (isMock ? simulate(() => db().updatePlannedPurchase(id, patch)) : coreApi.patch<void>(`/planned-purchases/${id}`, patch)),
  setStatus: (id: ID, status: "sent" | "accepted" | "rejected", note?: string) =>
    isMock ? simulate(() => db().setPlannedPurchaseStatus(id, status, note), LATENCY.fast) : coreApi.post<void>(`/planned-purchases/${id}/status`, { status, note }),
  convert: (id: ID, opts: Parameters<AppState["convertPlannedPurchase"]>[1]) =>
    isMock
      ? simulate<Invoice>(() => {
          const pp = db().plannedPurchases.find((p) => p.id === id);
          if (pp?.status !== "accepted") mockError("Only accepted planned purchases can be converted.", 409, "CONFLICT");
          return db().convertPlannedPurchase(id, opts);
        })
      : coreApi.post<Invoice>(`/planned-purchases/${id}/convert`, opts),
};

export const saleService = {
  create: (s: NewSale) =>
    isMock
      ? simulate<Sale>(() => {
          if (!s.lines.length) mockError("Add at least one item.");
          for (const l of s.lines) {
            const item = db().items.find((i) => i.id === l.itemId);
            if (!item) mockError("Unknown item.");
            if ((item.stock[s.branchId] ?? 0) < l.quantity) mockError(`Not enough stock for ${item.name} (${item.stock[s.branchId] ?? 0} available).`, 409, "INSUFFICIENT_STOCK");
          }
          return db().createSale(s);
        })
      : coreApi.post<Sale>("/sales", s),
};
