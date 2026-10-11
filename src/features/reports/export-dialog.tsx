"use client";

import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText, Info, Printer, Table2 } from "lucide-react";
import { toast } from "sonner";
import type { Currency, MonthlyReport } from "@/types";
import { formatMonth } from "@/lib/date";
import { rateLabel } from "@/lib/currency";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import type { ReportFigures } from "./report-data";

export type CurrencyView = "USD" | "KHR" | "dual";

export const REPORT_SECTIONS = [
  { id: "summary", label: "Summary (revenue, expenses, profit, margin)" },
  { id: "trend", label: "Revenue vs expenses (6 months)" },
  { id: "categories", label: "Expenses by category" },
  { id: "items", label: "Top-selling items" },
  { id: "branches", label: "Top branches" },
  { id: "cash", label: "Cash position" },
  { id: "outstanding", label: "Outstanding invoices & bills" },
  { id: "insights", label: "AI insights & recommended actions" },
] as const;
export type SectionId = (typeof REPORT_SECTIONS)[number]["id"];

type Format = "pdf" | "csv" | "excel";

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const esc = (v: string | number) => {
  const s = typeof v === "number" ? String(v) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildReportCsv(
  figs: Partial<Record<Currency, ReportFigures>>,
  view: CurrencyView,
  sections: SectionId[],
  meta: { report: MonthlyReport; scopeLabel: string; rate: number | null; insights: string[]; actions: string[] },
): string {
  const curs: Currency[] = view === "dual" ? ["USD", "KHR"] : [view];
  const f = (c: Currency) => figs[c]!;
  const base = f(curs[0]);
  const lines: (string | number)[][] = [];
  const blank = () => lines.push([]);
  const money = (n: number, c: Currency) => (c === "USD" ? n.toFixed(2) : Math.round(n));
  lines.push(["LedgerVision monthly report", formatMonth(meta.report.month)]);
  lines.push(["Status", meta.report.status]);
  if (meta.report.missing.length) lines.push(["Incomplete items", meta.report.missing.join("; ")]);
  lines.push(["Scope", meta.scopeLabel]);
  lines.push(["Basis", "Cash basis — posted income and expense transactions; transfers and items awaiting review excluded"]);
  lines.push(["Currency", curs.join(" + "), meta.rate ? `Other-currency amounts converted at ${rateLabel(meta.rate)}` : "No conversion rate configured"]);
  blank();
  const hdr = (first: string[], extra: string[] = []) => [...first, ...curs.map((c) => `Amount (${c})`), ...extra];

  if (sections.includes("summary")) {
    lines.push(["SUMMARY"]);
    lines.push(["Metric", ...curs.map((c) => `This month (${c})`), ...curs.map((c) => `Previous month (${c})`)]);
    lines.push(["Revenue", ...curs.map((c) => money(f(c).totals.revenue.value, c)), ...curs.map((c) => money(f(c).prev.revenue.value, c))]);
    lines.push(["Expenses", ...curs.map((c) => money(f(c).totals.expenses.value, c)), ...curs.map((c) => money(f(c).prev.expenses.value, c))]);
    lines.push(["Net profit", ...curs.map((c) => money(f(c).totals.net, c)), ...curs.map((c) => money(f(c).prev.net, c))]);
    lines.push(["Profit margin %", ...curs.map((c) => (f(c).totals.margin ?? 0).toFixed(1)), ...curs.map((c) => (f(c).prev.margin ?? 0).toFixed(1))]);
    blank();
  }
  if (sections.includes("trend")) {
    lines.push(["REVENUE VS EXPENSES"]);
    lines.push(["Month", ...curs.flatMap((c) => [`Revenue (${c})`, `Expenses (${c})`, `Net (${c})`])]);
    base.series.points.forEach((p, i) => lines.push([p.key, ...curs.flatMap((c) => { const q = f(c).series.points[i]; return [money(q.income, c), money(q.expenses, c), money(q.net, c)]; })]));
    blank();
  }
  if (sections.includes("categories")) {
    lines.push(["EXPENSES BY CATEGORY"]);
    lines.push(hdr(["Category"], ["Share %", ...curs.map((c) => `Previous month (${c})`)]));
    base.categories.forEach((cat) => { const by = (c: Currency) => f(c).categories.find((x) => x.categoryId === cat.categoryId); lines.push([cat.name, ...curs.map((c) => money(by(c)?.value ?? 0, c)), cat.share.toFixed(1), ...curs.map((c) => money(by(c)?.prev ?? 0, c))]); });
    blank();
  }
  if (sections.includes("items")) {
    lines.push(["TOP-SELLING ITEMS"]);
    lines.push(["Item", "SKU", "Units", ...curs.map((c) => `Revenue (${c})`)]);
    base.topItems.forEach((it) => lines.push([it.name, it.sku, it.quantity, ...curs.map((c) => money(f(c).topItems.find((x) => x.itemId === it.itemId)?.revenue ?? 0, c))]));
    blank();
  }
  if (sections.includes("branches")) {
    lines.push(["BRANCHES"]);
    lines.push(["Branch", ...curs.flatMap((c) => [`Revenue (${c})`, `Expenses (${c})`, `Net (${c})`]), "Margin %"]);
    base.branches.forEach((b) => lines.push([b.name, ...curs.flatMap((c) => { const x = f(c).branches.find((y) => y.branchId === b.branchId)!; return [money(x.revenue, c), money(x.expenses, c), money(x.net, c)]; }), b.margin !== null ? b.margin.toFixed(1) : ""]));
    blank();
  }
  if (sections.includes("cash")) {
    lines.push([`CASH POSITION (end of ${formatMonth(meta.report.month)})`]);
    lines.push(["Account", "Type", "Account currency", "Balance (account currency)"]);
    base.cash.byAccount.forEach((a) => lines.push([a.account.name, a.account.type, a.account.currency, money(a.balance, a.account.currency)]));
    lines.push(["Total", "", "", ...curs.map((c) => `${money(f(c).cash.total.value, c)} ${c}`)]);
    blank();
  }
  if (sections.includes("outstanding")) {
    lines.push(["OUTSTANDING (as of today)"]);
    lines.push(["Item", ...curs.map((c) => `Total (${c})`), ...curs.map((c) => `Overdue (${c})`), "Count", "Overdue count"]);
    lines.push(["Receivables (invoices)", ...curs.map((c) => money(f(c).receivables.total.value, c)), ...curs.map((c) => money(f(c).receivables.overdue.value, c)), base.receivables.count, base.receivables.overdueCount]);
    lines.push(["Payables (bills)", ...curs.map((c) => money(f(c).payables.total.value, c)), ...curs.map((c) => money(f(c).payables.overdue.value, c)), base.payables.count, base.payables.overdueCount]);
    blank();
  }
  if (sections.includes("insights")) {
    lines.push(["AI INSIGHTS (simulated, rule-based; not accounting or tax advice)"]);
    meta.insights.forEach((t) => lines.push([t]));
    lines.push(["RECOMMENDED ACTIONS"]);
    meta.actions.forEach((t) => lines.push([t]));
  }
  return lines.map((l) => l.map(esc).join(",")).join("\r\n");
}

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: MonthlyReport;
  rate: number | null;
  initialView: CurrencyView;
  onCsv: (view: CurrencyView, sections: SectionId[]) => void;
  onPrint: (view: CurrencyView, sections: SectionId[]) => void;
}

export function ExportDialog({ open, onOpenChange, report, rate, initialView, onCsv, onPrint }: Props) {
  const [format, setFormat] = useState<Format>("pdf");
  const [view, setView] = useState<CurrencyView>(initialView);
  const [sections, setSections] = useState<SectionId[]>(REPORT_SECTIONS.map((s) => s.id));
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  const toggle = (id: SectionId, on: boolean) => setSections((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const formats: { id: Format; label: string; icon: typeof FileText; hint: string }[] = [
    { id: "pdf", label: "PDF", icon: Printer, hint: "Print-friendly layout — choose “Save as PDF” in the print dialog." },
    { id: "csv", label: "CSV", icon: Table2, hint: "Report tables as a spreadsheet-ready file." },
    { id: "excel", label: "Excel", icon: FileSpreadsheet, hint: "Generated by the reporting service." },
  ];

  const submit = () => {
    if (!sections.length) return;
    if (format === "csv") {
      onCsv(view, sections);
      toast.success("CSV downloaded", { description: `${formatMonth(report.month)} report · ${sections.length} sections` });
      onOpenChange(false);
    } else if (format === "pdf") {
      onOpenChange(false);
      onPrint(view, sections);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {formatMonth(report.month)} report</DialogTitle>
          <DialogDescription>Choose a format, currency view and the sections to include.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Report status</span>
            <StatusBadge status={report.status} />
            {report.status === "incomplete" && <span className="text-xs text-muted-foreground">Exports will be labelled incomplete.</span>}
          </div>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Format</legend>
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as Format)} className="grid grid-cols-3 gap-2">
              {formats.map((f) => (
                <Label key={f.id} htmlFor={`fmt-${f.id}`} className={cn("flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border p-3 font-normal transition-colors", format === f.id ? "border-primary bg-primary-light/50" : "hover:bg-muted")}>
                  <span className="flex w-full items-center justify-between">
                    <f.icon className="size-4 text-muted-foreground" aria-hidden />
                    <RadioGroupItem id={`fmt-${f.id}`} value={f.id} />
                  </span>
                  <span className="text-sm font-medium">{f.label}</span>
                </Label>
              ))}
            </RadioGroup>
            <p className="mt-2 text-xs text-muted-foreground">{formats.find((f) => f.id === format)!.hint}</p>
            {format === "excel" && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-info/25 bg-info-light px-3 py-2 text-xs text-info-text" role="note">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Excel workbooks are generated by the reporting service. In this demo, CSV export is available and opens in Excel.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Currency view</legend>
            <RadioGroup value={view} onValueChange={(v) => setView(v as CurrencyView)} className="flex flex-wrap gap-4">
              {(["USD", "KHR", "dual"] as CurrencyView[]).map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <RadioGroupItem id={`cv-${v}`} value={v} disabled={v !== "USD" && !rate} />
                  <Label htmlFor={`cv-${v}`} className={cn("font-normal", v !== "USD" && !rate && "text-muted-foreground")}>{v === "dual" ? "Dual (USD + KHR)" : v}</Label>
                </div>
              ))}
            </RadioGroup>
            <p className="mt-2 text-xs text-muted-foreground">{rate ? `Converted values use the configured rate ${rateLabel(rate)}.` : "KHR and dual views need a conversion rate — configure one in Settings."}</p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-medium">
              Sections
              <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => setSections(sections.length === REPORT_SECTIONS.length ? [] : REPORT_SECTIONS.map((s) => s.id))}>
                {sections.length === REPORT_SECTIONS.length ? "Clear all" : "Select all"}
              </button>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REPORT_SECTIONS.map((s) => (
                <div key={s.id} className="flex items-start gap-2">
                  <Checkbox id={`sec-${s.id}`} checked={sections.includes(s.id)} onCheckedChange={(c) => toggle(s.id, c === true)} />
                  <Label htmlFor={`sec-${s.id}`} className="text-sm leading-tight font-normal">{s.label}</Label>
                </div>
              ))}
            </div>
            {!sections.length && <p className="mt-2 text-xs text-destructive" role="alert">Select at least one section.</p>}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {format === "excel" ? (
            <Button onClick={() => setFormat("csv")}>
              <Table2 /> Use CSV instead
            </Button>
          ) : (
            <Button onClick={submit} disabled={!sections.length}>
              {format === "pdf" ? <Printer /> : <Download />}
              {format === "pdf" ? "Open print view" : "Download CSV"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

