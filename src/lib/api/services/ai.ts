/**
 * AI services: Financial Advisor, Monthly Reports, Forecasting & What-If.
 *
 * Mock mode answers with deterministic engines that compute every figure from
 * the same store data shown elsewhere (see `features/ai-advisor/engine.ts`,
 * `features/reports/readiness.ts`, `features/forecasting/model.ts`).
 * Live mode calls the FastAPI AI service (`AI_API_URL`).
 *
 * The advisor is read-only: `ask` only appends conversation messages, it never
 * touches financial records.
 */
import type { AdvisorConversation, AdvisorMessage, ID, MonthlyReport, TargetBudget, WhatIfScenario } from "@/types";
import type { Scope } from "@/lib/analytics";
import { nowISO } from "@/lib/date";
import { uid } from "@/store/app-store";
import { answerQuestion, titleFromQuestion, type AdvisorContext } from "@/features/ai-advisor/engine";
import { reportReadiness } from "@/features/reports/readiness";
import { computeBaseline, type BaselineForecast, type ForecastInput } from "@/features/forecasting/model";
import { isMock } from "../config";
import { aiApi } from "../http";
import { LATENCY, delay, mockError, simulate } from "../mock";
import { db } from "./_store";

export type AdvisorScope = Omit<AdvisorContext, "data">;

function advisorLatency(question: string) {
  // 1.2–1.8 s, deterministic per question so the demo is repeatable.
  let h = 0;
  for (const c of question) h = (h * 31 + c.charCodeAt(0)) % 600;
  return 1200 + h;
}

export const aiService = {
  /** Create an empty conversation titled from the first question. */
  startConversation: async (firstQuestion: string): Promise<AdvisorConversation> => {
    const c: AdvisorConversation = { id: uid("conv"), title: titleFromQuestion(firstQuestion), createdAt: nowISO(), updatedAt: nowISO(), messages: [] };
    if (!isMock) return aiApi.post<AdvisorConversation>("/advisor/conversations", { title: c.title });
    db().saveConversation(c);
    return c;
  },

  /**
   * Ask a question. The user message is stored immediately; the assistant
   * answer is appended after the (simulated) analysis completes.
   */
  ask: async (conversationId: ID, question: string, scope: AdvisorScope): Promise<AdvisorMessage> => {
    const userMsg: AdvisorMessage = { id: uid("msg"), role: "user", content: question.trim(), createdAt: nowISO() };
    if (!isMock) {
      return aiApi.post<AdvisorMessage>(`/advisor/conversations/${conversationId}/messages`, { content: userMsg.content, branchIds: scope.scope.branchIds, currency: scope.money.display });
    }
    if (!db().conversations.some((c) => c.id === conversationId)) mockError("This conversation no longer exists.", 404, "NOT_FOUND");
    db().appendAdvisorMessage(conversationId, userMsg);
    await delay(advisorLatency(question));
    const s = db();
    const answer = answerQuestion(question, { ...scope, data: s });
    const msg: AdvisorMessage = { id: uid("msg"), role: "assistant", createdAt: nowISO(), ...answer };
    db().appendAdvisorMessage(conversationId, msg);
    return msg;
  },

  /** Re-run the last unanswered question (after an error). */
  retry: async (conversationId: ID, scope: AdvisorScope): Promise<AdvisorMessage> => {
    const c = db().conversations.find((x) => x.id === conversationId);
    const last = c?.messages[c.messages.length - 1];
    if (!c || !last || last.role !== "user") mockError("Nothing to retry.");
    await delay(advisorLatency(last.content));
    const msg: AdvisorMessage = { id: uid("msg"), role: "assistant", createdAt: nowISO(), ...answerQuestion(last.content, { ...scope, data: db() }) };
    db().appendAdvisorMessage(conversationId, msg);
    return msg;
  },

  renameConversation: (id: ID, title: string) =>
    isMock
      ? simulate(() => {
          const c = db().conversations.find((x) => x.id === id);
          if (!c) mockError("Conversation not found.", 404, "NOT_FOUND");
          const t = title.trim();
          if (!t) mockError("Enter a title.");
          db().saveConversation({ ...c, title: t.slice(0, 80), updatedAt: nowISO() });
        }, LATENCY.fast)
      : aiApi.patch<void>(`/advisor/conversations/${id}`, { title }),

  deleteConversation: (id: ID) => (isMock ? simulate(() => db().deleteConversation(id), LATENCY.fast) : aiApi.delete<void>(`/advisor/conversations/${id}`)),

  /**
   * Generate (or regenerate) a monthly report. Status is `generating` while it
   * runs, then `complete` or `incomplete` from the real readiness conditions.
   */
  generateReport: async (month: string, scope: Scope, branchScope: MonthlyReport["branchScope"]): Promise<MonthlyReport> => {
    if (!isMock) return aiApi.post<MonthlyReport>("/reports/generate", { month, branchScope });
    const id = `rep_${month}`;
    const existing = db().reports.find((r) => r.id === id);
    db().upsertReport({ id, month, status: "generating", generatedAt: existing?.generatedAt, missing: existing?.missing ?? [], branchScope });
    await delay(LATENCY.ai + 800);
    const s = db();
    const hasData = s.transactions.some((t) => t.date.startsWith(month) && scope.branchIds.includes(t.branchId) && t.status === "posted");
    let report: MonthlyReport;
    if (!hasData) {
      report = { id, month, status: "failed", generatedAt: nowISO(), missing: ["No posted transactions were found for this month, so there is nothing to report."], branchScope };
    } else {
      const issues = reportReadiness(month, s, scope);
      report = { id, month, status: issues.length ? "incomplete" : "complete", generatedAt: nowISO(), missing: issues.map((i) => i.label), branchScope };
    }
    db().upsertReport(report);
    return report;
  },

  /** Fit the forecast model (simulated model latency so loading states show). */
  forecast: (input: ForecastInput): Promise<BaselineForecast> =>
    isMock
      ? simulate(() => computeBaseline(input), LATENCY.slow)
      : aiApi.post<BaselineForecast>("/forecasts", { branchIds: input.scope.branchIds, currency: input.money.display, horizonDays: input.horizonDays, asOf: input.asOf }),

  saveScenario: (s: WhatIfScenario) =>
    isMock
      ? simulate(() => {
          if (!s.name.trim()) mockError("Enter a scenario name.");
          db().saveScenario(s);
          return s;
        }, LATENCY.fast)
      : aiApi.post<WhatIfScenario>("/scenarios", s),
  deleteScenario: (id: ID) => (isMock ? simulate(() => db().deleteScenario(id), LATENCY.fast) : aiApi.delete<void>(`/scenarios/${id}`)),
  saveTargetBudget: (b: TargetBudget) =>
    isMock
      ? simulate(() => {
          if (!b.name.trim()) mockError("Enter a budget name.");
          db().saveTargetBudget(b);
          return b;
        })
      : aiApi.post<TargetBudget>("/target-budgets", b),
  deleteTargetBudget: (id: ID) => (isMock ? simulate(() => db().deleteTargetBudget(id), LATENCY.fast) : aiApi.delete<void>(`/target-budgets/${id}`)),
};
