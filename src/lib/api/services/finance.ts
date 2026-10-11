import type { Bill, FinancialAccount, ID, ImportBatch, Payment, Reconciliation, ReconLine, TillSession, Transaction } from "@/types";
import type { NewBill, NewPayment, NewTransaction, StatementRowInput, AppState } from "@/store/app-store";
import { isMock } from "../config";
import { coreApi } from "../http";
import { LATENCY, mockError, simulate } from "../mock";
import { db } from "./_store";
import { billTotals } from "@/lib/domain";

export const transactionService = {
  create: (t: NewTransaction) =>
    isMock
      ? simulate(() => {
          if (t.amount <= 0) mockError("Amount must be greater than zero.");
          if (t.type === "transfer" && t.accountId === t.toAccountId) mockError("Choose two different accounts for a transfer.");
          return db().addTransaction(t);
        })
      : coreApi.post<Transaction>("/transactions", t),
  update: (id: ID, patch: Partial<Transaction>) =>
    isMock ? simulate(() => db().updateTransaction(id, patch), LATENCY.fast) : coreApi.patch<void>(`/transactions/${id}`, patch),
  remove: (id: ID) =>
    isMock
      ? simulate(() => {
          if (!db().deleteTransaction(id)) mockError("Only unreconciled manual transactions can be deleted.", 409, "CONFLICT");
        })
      : coreApi.delete<void>(`/transactions/${id}`),
  categorize: (ids: ID[], categoryId?: ID) =>
    isMock ? simulate(() => db().categorizeTransactions(ids, categoryId), LATENCY.fast) : coreApi.post<void>("/transactions/categorize", { ids, categoryId }),
};

export const accountService = {
  create: (a: Omit<FinancialAccount, "id" | "status">) => (isMock ? simulate(() => db().createAccount(a)) : coreApi.post<FinancialAccount>("/accounts", a)),
  update: (id: ID, patch: Partial<FinancialAccount>) => (isMock ? simulate(() => db().updateAccount(id, patch)) : coreApi.patch<void>(`/accounts/${id}`, patch)),
};

export const billService = {
  create: (b: NewBill) =>
    isMock
      ? simulate(() => {
          if (b.dueDate < b.issueDate) mockError("Due date cannot be before the bill date.");
          return db().createBill(b);
        })
      : coreApi.post<Bill>("/bills", b),
  update: (id: ID, patch: Partial<Bill>) => (isMock ? simulate(() => db().updateBill(id, patch)) : coreApi.patch<void>(`/bills/${id}`, patch)),
  approve: (id: ID) => (isMock ? simulate(() => db().approveBill(id), LATENCY.fast) : coreApi.post<void>(`/bills/${id}/approve`)),
  void: (id: ID) => (isMock ? simulate(() => db().voidBill(id)) : coreApi.post<void>(`/bills/${id}/void`)),
  recordPayment: (id: ID, p: NewPayment) =>
    isMock
      ? simulate<Payment>(() => {
          const bill = db().bills.find((x) => x.id === id);
          if (!bill) mockError("Bill not found.", 404, "NOT_FOUND");
          const { balance } = billTotals(bill);
          if (p.amount <= 0) mockError("Payment amount must be greater than zero.");
          if (p.amount > balance + 0.0001) mockError("Payment exceeds the outstanding balance.");
          return db().recordBillPayment(id, p);
        })
      : coreApi.post<Payment>(`/bills/${id}/payments`, p),
};

export const importService = {
  createBatch: (b: Omit<ImportBatch, "id" | "createdAt" | "createdBy" | "createdRecordIds">) =>
    isMock ? simulate(() => db().createImportBatch(b), LATENCY.fast) : coreApi.post<ImportBatch>("/imports", b),
  updateBatch: (id: ID, patch: Partial<ImportBatch>) => (isMock ? simulate(() => db().updateImportBatch(id, patch), LATENCY.fast) : coreApi.patch<void>(`/imports/${id}`, patch)),
  commitStatementRows: (batchId: ID, accountId: ID, rows: StatementRowInput[]) =>
    isMock ? simulate(() => db().commitStatementRows(batchId, accountId, rows), LATENCY.slow) : coreApi.post<ID[]>(`/imports/${batchId}/commit`, { accountId, rows }),
};

export const reconciliationService = {
  create: (r: Parameters<AppState["createReconciliation"]>[0]) => (isMock ? simulate(() => db().createReconciliation(r), LATENCY.slow) : coreApi.post<Reconciliation>("/reconciliations", r)),
  updateLine: (reconId: ID, lineId: ID, patch: Partial<ReconLine>) =>
    isMock ? simulate(() => db().updateReconLine(reconId, lineId, patch), LATENCY.fast) : coreApi.patch<void>(`/reconciliations/${reconId}/lines/${lineId}`, patch),
  createTransactionFromLine: (reconId: ID, lineId: ID, categoryId: ID) =>
    isMock ? simulate(() => db().createTransactionFromReconLine(reconId, lineId, categoryId)) : coreApi.post<void>(`/reconciliations/${reconId}/lines/${lineId}/transaction`, { categoryId }),
  submit: (id: ID, note?: string) =>
    isMock
      ? simulate(() => {
          const r = db().reconciliations.find((x) => x.id === id);
          if (r?.lines.some((l) => l.state === "suggested")) mockError("Accept or reject every suggested match before submitting.");
          return db().submitReconciliation(id, note);
        })
      : coreApi.post<void>(`/reconciliations/${id}/submit`, { note }),
  signOff: (id: ID, note?: string) => (isMock ? simulate(() => db().signOffReconciliation(id, note)) : coreApi.post<void>(`/reconciliations/${id}/sign-off`, { note })),
  returnForCorrection: (id: ID, note: string) => (isMock ? simulate(() => db().returnReconciliation(id, note)) : coreApi.post<void>(`/reconciliations/${id}/return`, { note })),
};

export const tillService = {
  save: (t: Parameters<AppState["saveTillSession"]>[0]) => (isMock ? simulate<TillSession>(() => db().saveTillSession(t)) : coreApi.post<TillSession>("/till-sessions", t)),
  signOff: (id: ID, note?: string) => (isMock ? simulate(() => db().signOffTill(id, note)) : coreApi.post<void>(`/till-sessions/${id}/sign-off`, { note })),
  returnForCorrection: (id: ID, note: string) => (isMock ? simulate(() => db().returnTill(id, note)) : coreApi.post<void>(`/till-sessions/${id}/return`, { note })),
};
