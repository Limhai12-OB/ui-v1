"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, Loader2, RotateCcw, Sparkles, Upload, XCircle } from "lucide-react";
import type { Branch, Category, Currency, ID, Item } from "@/types";
import type { NewItem } from "@/store/app-store";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { importService, itemService } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/currency";
import { PageHeader } from "@/components/shared/page-header";
import { Steps } from "@/components/shared/steps";
import { StatCard } from "@/components/shared/stat";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DemoNotice } from "@/components/shared/demo-notice";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { nowISO } from "@/lib/date";
import { editDistance, parseCsv, toCsv } from "./csv";
import { useItemCategories } from "./inventory-shared";

const REQUIRED = ["sku", "name", "category", "selling_price", "cost_price"] as const;
const SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MAX_BYTES = 1024 * 1024;

interface RawFile {
  fileName: string;
  fileSize: number;
  header: string[];
  rows: string[][];
}

interface RowResult {
  line: number;
  sku: string;
  name: string;
  nameKm?: string;
  categoryInput: string;
  categoryId?: ID;
  suggestion?: Category;
  unit: string;
  currency: Currency;
  sellingPrice: number | null;
  costPrice: number | null;
  reorderLevel: number;
  stock: Record<ID, number>;
  errors: string[];
  warnings: string[];
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/[$៛,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function matchCategory(input: string, cats: Category[]): { id?: ID; suggestion?: Category } {
  const q = input.trim().toLowerCase();
  if (!q) return {};
  const exact = cats.find((c) => c.id.toLowerCase() === q || c.name.toLowerCase() === q || (c.nameKm ?? "") === input.trim());
  if (exact) return { id: exact.id };
  let best: { c: Category; d: number } | undefined;
  for (const c of cats) {
    const n = c.name.toLowerCase();
    const d = n.startsWith(q) || q.startsWith(n) || n.includes(q) ? 0.5 : editDistance(q, n);
    if (!best || d < best.d) best = { c, d };
  }
  return best && best.d <= Math.max(3, Math.floor(q.length / 3)) ? { suggestion: best.c } : {};
}

function validate(file: RawFile, items: Item[], cats: Category[], branches: Branch[], allowedBranchIds: ID[], overrides: Record<number, ID>): { rows: RowResult[]; missingColumns: string[]; columnNotes: string[] } {
  const header = file.header.map((h) => h.trim().toLowerCase());
  const missingColumns = REQUIRED.filter((c) => !header.includes(c));
  const columnNotes: string[] = [];
  const stockCols: { idx: number; branchId: ID }[] = [];
  header.forEach((h, idx) => {
    if (!h.startsWith("initial_stock_")) return;
    const code = h.slice("initial_stock_".length);
    const b = branches.find((x) => x.code.toLowerCase() === code || x.id.toLowerCase() === code);
    if (!b) columnNotes.push(`Column “${file.header[idx]}” doesn't match a branch code and will be ignored.`);
    else if (!allowedBranchIds.includes(b.id)) columnNotes.push(`Column “${file.header[idx]}” is for ${b.name}; you can only set opening stock for your branch, so it will be ignored.`);
    else stockCols.push({ idx, branchId: b.id });
  });
  const col = (r: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : undefined;
  };
  const existing = new Map(items.map((i) => [i.sku.toUpperCase(), i]));
  const firstSeen = new Map<string, number>();

  const rows = file.rows.map((r, i): RowResult => {
    const line = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const sku = (col(r, "sku") ?? "").toUpperCase();
    const name = col(r, "name") ?? "";
    const categoryInput = col(r, "category") ?? "";
    if (!sku) errors.push("SKU is missing");
    else if (!SKU_RE.test(sku)) errors.push("SKU may only contain A–Z, 0–9 and dashes");
    else if (existing.has(sku)) errors.push(`SKU already exists (${existing.get(sku)!.name})`);
    else if (firstSeen.has(sku)) errors.push(`Duplicate SKU — also on row ${firstSeen.get(sku)}`);
    if (sku && !firstSeen.has(sku)) firstSeen.set(sku, line);
    if (!name) errors.push("Name is missing");

    let categoryId: ID | undefined;
    let suggestion: Category | undefined;
    if (!categoryInput) errors.push("Category is missing");
    else if (overrides[line]) categoryId = overrides[line];
    else {
      const m = matchCategory(categoryInput, cats);
      categoryId = m.id;
      suggestion = m.suggestion;
      if (!categoryId) errors.push(`Unknown category “${categoryInput}”`);
    }

    const sell = num(col(r, "selling_price"));
    const cost = num(col(r, "cost_price"));
    if (sell === null) errors.push("Selling price is missing");
    else if (Number.isNaN(sell)) errors.push(`Selling price “${col(r, "selling_price")}” isn't a number`);
    else if (sell < 0) errors.push("Selling price can't be negative");
    if (cost === null) errors.push("Cost price is missing");
    else if (Number.isNaN(cost)) errors.push(`Cost price “${col(r, "cost_price")}” isn't a number`);
    else if (cost < 0) errors.push("Cost price can't be negative");
    if (sell !== null && cost !== null && !Number.isNaN(sell) && !Number.isNaN(cost) && sell < cost) warnings.push("Selling price is below cost");

    const currencyRaw = (col(r, "currency") ?? "").toUpperCase();
    let currency: Currency = "USD";
    if (currencyRaw === "KHR" || currencyRaw === "USD") currency = currencyRaw;
    else if (currencyRaw) errors.push(`Currency “${currencyRaw}” must be USD or KHR`);

    const reorderRaw = num(col(r, "reorder_level"));
    let reorderLevel = 10;
    if (reorderRaw === null) warnings.push("No reorder level — defaulting to 10");
    else if (Number.isNaN(reorderRaw) || reorderRaw < 0 || !Number.isInteger(reorderRaw)) errors.push("Reorder level must be a whole number ≥ 0");
    else reorderLevel = reorderRaw;

    let unit = col(r, "unit") ?? "";
    if (!unit) {
      unit = "pcs";
      warnings.push("No unit — defaulting to pcs");
    }

    const stock: Record<ID, number> = {};
    for (const sc of stockCols) {
      const v = num(r[sc.idx]);
      if (v === null) continue;
      if (Number.isNaN(v) || v < 0 || !Number.isInteger(v)) errors.push(`Initial stock “${r[sc.idx]}” must be a whole number ≥ 0`);
      else if (v > 0) stock[sc.branchId] = v;
    }

    return {
      line,
      sku,
      name,
      nameKm: col(r, "name_km") || undefined,
      categoryInput,
      categoryId,
      suggestion,
      unit,
      currency,
      sellingPrice: sell !== null && !Number.isNaN(sell) ? sell : null,
      costPrice: cost !== null && !Number.isNaN(cost) ? cost : null,
      reorderLevel,
      stock,
      errors,
      warnings,
    };
  });
  return { rows, missingColumns, columnNotes };
}

function sampleCsv(branches: Branch[]): string {
  const codes = branches.filter((b) => b.status === "active").map((b) => b.code);
  const header = ["sku", "name", "name_km", "category", "unit", "selling_price", "cost_price", "reorder_level", ...codes.map((c) => `initial_stock_${c}`)];
  const stock = (...q: number[]) => codes.map((_, i) => q[i] ?? 0);
  const rows: (string | number)[][] = [
    header,
    ["BEV-007", "Sugarcane Juice 350ml", "ទឹកអំពៅ", "Beverages", "bottle", 1.1, 0.6, 40, ...stock(80, 50, 40, 20)],
    ["SNK-005", "Banana Chips 150g", "ចេកចៀន", "Snacks", "pack", 1.6, 0.95, 24, ...stock(60, 40, 30, 15)],
    ["COF-003", "Ratanakiri Robusta Coffee 500g", "កាហ្វេរតនគិរី", "Coffee & Tea", "pack", 9.5, 6.2, 12, ...stock(30, 20, 12, 6)],
    ["SPC-005", "Prahok Fermented Fish 400g", "ប្រហុក", "Spices & Condiments", "jar", 3.8, 2.4, 15, ...stock(36, 24, 20, 0)],
    ["RIC-003", "Sticky Rice 5kg", "អង្ករដំណើប", "Rice & Grains", "bag", 6.9, 5.3, 15, ...stock(40, 25, 20, 10)],
    ["HOU-005", "Mosquito Coils (10)", "ធូបដុតមូស", "Household", "pack", 1.2, 0.7, 30, ...stock(70, 45, 40, 20)],
    ["FRE-003", "Morning Glory Bunch", "ត្រកួន", "Fresh Produce", "bunch", 0.5, 0.32, 20, ...stock(40, 30, 25, 10)],
    ["BEV-008", "Palm Juice 330ml", "ទឹកត្នោត", "Beverage", "can", 0.95, 0.55, 48, ...stock(96, 60, 48, 24)],
    ["BEV-001", "Lager Beer Can 330ml (24)", "", "Beverages", "case", 16.8, 13.4, 12, ...stock(10)],
    ["SNK-005", "Banana Chips 150g (dup)", "", "Snacks", "pack", 1.6, 0.95, 24, ...stock()],
    ["HOU-006", "Charcoal Briquettes 3kg", "", "Household", "bag", "abc", 2.1, 10, ...stock(20)],
    ["SPC-006", "", "", "Spices & Condiments", "pack", 2.5, 1.4, 10, ...stock()],
    ["SNK-006", "Lotus Seeds Snack 100g", "គ្រាប់ឈូក", "Snacks", "pack", 2.2, 2.6, 20, ...stock(30, 20)],
  ];
  return toCsv(rows);
}

export function ItemImportPage() {
  const items = useAppStore((s) => s.items);
  const allBranches = useAppStore((s) => s.branches);
  const { branches, isOwner, user } = useScope();
  const canManage = useCan("items.manage");
  const cats = useItemCategories();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<RawFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, ID>>({});
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<Item[] | null>(null);

  const allowedBranchIds = useMemo(() => branches.filter((b) => b.status === "active").map((b) => b.id), [branches]);
  const activeAll = allBranches.filter((b) => b.status === "active");

  const validation = useMemo(() => (file ? validate(file, items, cats, allBranches, allowedBranchIds, overrides) : null), [file, items, cats, allBranches, allowedBranchIds, overrides]);
  const validRows = validation?.rows.filter((r) => r.errors.length === 0) ?? [];
  const selected = validRows.filter((r) => !deselected.has(r.line));
  const errorRows = validation ? validation.rows.length - validRows.length : 0;
  const warnRows = validRows.filter((r) => r.warnings.length > 0).length;

  const loadText = (text: string, fileName: string, fileSize: number) => {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setReadError("The file has no data rows. Add at least one item below the header row.");
      return;
    }
    setFile({ fileName, fileSize, header: rows[0], rows: rows.slice(1) });
    setOverrides({});
    setDeselected(new Set());
    setReadError(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setReadError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setReadError(`“${f.name}” isn't a CSV file. Save your spreadsheet as CSV (UTF-8) and try again.`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setReadError("The file is larger than 1 MB. Split the catalog into smaller files.");
      return;
    }
    setReading(true);
    try {
      loadText(await f.text(), f.name, f.size);
    } catch {
      setReadError("We couldn't read that file. Check it isn't open in another program and try again.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const header = ["sku", "name", "name_km", "category", "unit", "selling_price", "cost_price", "reorder_level", ...activeAll.map((b) => `initial_stock_${b.code}`)];
    const example = ["BEV-010", "Example Item 500ml", "", cats[0]?.name ?? "Beverages", "bottle", "1.50", "0.90", "24", ...activeAll.map(() => "0")];
    const blob = new Blob(["﻿" + toCsv([header, example])], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledgervision-item-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = useAction(
    async () => {
      const payload: NewItem[] = selected.map((r) => ({
        sku: r.sku,
        name: r.name,
        nameKm: r.nameKm,
        categoryId: r.categoryId!,
        unit: r.unit,
        sellingPrice: r.sellingPrice!,
        costPrice: r.costPrice!,
        currency: r.currency,
        reorderLevel: r.reorderLevel,
        status: "active",
        initialStock: r.stock,
      }));
      const batch = await importService.createBatch({
        kind: "item_catalog",
        fileName: file!.fileName,
        fileSize: file!.fileSize,
        branchId: isOwner ? (branches.find((b) => b.isMain)?.id ?? branches[0].id) : user.branchId!,
        status: "processing",
        totalRows: validation!.rows.length,
        importedRows: 0,
        duplicateRows: 0,
        errorRows: errorRows,
        reviewRows: 0,
      });
      try {
        const created = await itemService.bulkImport(payload);
        await importService.updateBatch(batch.id, { status: "completed", importedRows: created.length, completedAt: nowISO(), createdRecordIds: created.map((c) => c.id) });
        return created;
      } catch (e) {
        await importService.updateBatch(batch.id, { status: "failed", errorMessage: e instanceof Error ? e.message : "Import failed" });
        throw e;
      }
    },
    { success: (c) => `${c.length} item${c.length === 1 ? "" : "s"} imported`, onSuccess: (c) => setResult(c) },
  );

  if (!canManage) return <EmptyState title="You can't import items" action={<Button asChild><Link href="/items">Back to items</Link></Button>} />;

  const step = result ? 2 : file ? 1 : 0;
  const reset = () => {
    setFile(null);
    setResult(null);
    setOverrides({});
    setDeselected(new Set());
  };
  const totalStockUnits = selected.reduce((s, r) => s + Object.values(r.stock).reduce((a, b) => a + b, 0), 0);

  return (
    <>
      <UnsavedChangesGuard when={!!file && !result && !doImport.pending} message="Your file hasn't been imported yet. Leave and discard the preview?" />
      <PageHeader backHref="/items" backLabel="Items" title="Bulk item import" description="Add many items at once from a CSV file. Nothing is created until you review the rows and confirm." />
      <Steps
        className="mb-6"
        current={step}
        steps={[
          { id: "upload", label: "Upload file" },
          { id: "review", label: "Review & select" },
          { id: "done", label: "Done" },
        ]}
      />

      {step === 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>Upload a CSV file</CardTitle>
              <CardDescription>UTF-8 CSV with a header row. Khmer names are supported.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onFile(e.dataTransfer.files[0]);
                }}
                className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors", dragOver ? "border-primary bg-primary-light/40" : "border-border bg-muted/20")}
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-light text-primary">
                  {reading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
                </span>
                <div>
                  <p className="text-sm font-medium">{reading ? "Reading file…" : "Drag a CSV file here"}</p>
                  <p className="text-xs text-muted-foreground">or choose one from your computer · max 1 MB</p>
                </div>
                <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-file" onChange={(e) => void onFile(e.target.files?.[0])} />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => inputRef.current?.click()} disabled={reading}>
                    <Upload /> Choose file
                  </Button>
                  <Button type="button" variant="outline" onClick={() => loadText(sampleCsv(allBranches), "sample-catalog.csv", 2048)}>
                    <Sparkles /> Use sample catalog
                  </Button>
                </div>
              </div>
              {readError && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-light px-3 py-2 text-sm text-error-text">
                  <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {readError}
                </p>
              )}
              <DemoNotice>The sample catalog contains deliberate problems (an existing SKU, a duplicate, an unknown category, a bad price and a missing name) so you can see how validation works.</DemoNotice>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Template columns</CardTitle>
              <CardDescription>Column order doesn&rsquo;t matter; names are case-insensitive.</CardDescription>
            </CardHeader>
            <ul className="divide-y text-sm">
              {[
                ["sku", true, "Unique code, A–Z 0–9 and dashes"],
                ["name", true, "Item name in English"],
                ["name_km", false, "Khmer name"],
                ["category", true, `Item category name, e.g. ${cats.slice(0, 2).map((c) => c.name).join(", ")}`],
                ["unit", false, "pcs, pack, bottle, case… (default pcs)"],
                ["selling_price", true, "Number ≥ 0"],
                ["cost_price", true, "Number ≥ 0"],
                ["reorder_level", false, "Whole number (default 10)"],
                ["currency", false, "USD (default) or KHR"],
              ].map(([c, req, d]) => (
                <li key={c as string} className="flex items-start justify-between gap-3 px-5 py-2">
                  <div>
                    <code className="text-xs font-semibold">{c}</code>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                  {req ? <Badge variant="info">Required</Badge> : <Badge variant="neutral">Optional</Badge>}
                </li>
              ))}
              <li className="px-5 py-2">
                <code className="text-xs font-semibold">initial_stock_&lt;branch code&gt;</code>
                <p className="text-xs text-muted-foreground">Opening quantity per branch. {isOwner ? "Codes:" : "You can set your branch only:"}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(isOwner ? activeAll : branches).map((b) => (
                    <code key={b.id} className="rounded bg-muted px-1.5 py-0.5 text-[11px]" title={b.name}>
                      initial_stock_{b.code}
                    </code>
                  ))}
                </div>
              </li>
            </ul>
            <div className="border-t p-4">
              <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                <Download /> Download template
              </Button>
            </div>
          </Card>
        </div>
      )}

      {step === 1 && validation && (
        <>
          {validation.missingColumns.length > 0 ? (
            <Card>
              <EmptyState
                icon={XCircle}
                title="Required columns are missing"
                description={`“${file!.fileName}” is missing: ${validation.missingColumns.join(", ")}. Download the template to see the expected header row.`}
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadTemplate}>
                      <Download /> Template
                    </Button>
                    <Button onClick={reset}>
                      <RotateCcw /> Choose another file
                    </Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Rows in file" value={formatNumber(validation.rows.length)} icon={FileSpreadsheet} description={file!.fileName} />
                <StatCard label="Ready to import" value={formatNumber(validRows.length)} icon={CheckCircle2} description={`${selected.length} selected`} />
                <StatCard label="With warnings" value={formatNumber(warnRows)} icon={AlertTriangle} description="Importable — review the notes" />
                <StatCard label="With errors" value={formatNumber(errorRows)} icon={XCircle} description="Fix in the file and re-upload" />
              </div>
              {validation.columnNotes.length > 0 && (
                <div role="note" className="mb-4 space-y-1 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
                  {validation.columnNotes.map((n) => (
                    <p key={n} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {n}
                    </p>
                  ))}
                </div>
              )}
              <Card className="gap-0 py-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                  <p className="text-sm text-muted-foreground">
                    Rows with errors can&rsquo;t be selected. Unknown categories show a suggested match you can apply.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDeselected(new Set())} disabled={selected.length === validRows.length}>
                      Select all valid
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeselected(new Set(validRows.map((r) => r.line)))} disabled={selected.length === 0}>
                      Clear selection
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 bg-muted/40 pl-4">
                          <Checkbox
                            aria-label="Select all valid rows"
                            checked={selected.length > 0 && selected.length === validRows.length ? true : selected.length > 0 ? "indeterminate" : false}
                            onCheckedChange={(v) => setDeselected(v ? new Set() : new Set(validRows.map((r) => r.line)))}
                            disabled={validRows.length === 0}
                          />
                        </TableHead>
                        <TableHead className="bg-muted/40 text-xs">Row</TableHead>
                        <TableHead className="bg-muted/40 text-xs">SKU</TableHead>
                        <TableHead className="bg-muted/40 text-xs">Item</TableHead>
                        <TableHead className="bg-muted/40 text-xs">Category</TableHead>
                        <TableHead className="bg-muted/40 text-xs">Unit</TableHead>
                        <TableHead className="bg-muted/40 text-right text-xs">Price</TableHead>
                        <TableHead className="bg-muted/40 text-right text-xs">Cost</TableHead>
                        <TableHead className="bg-muted/40 text-right text-xs">Reorder</TableHead>
                        <TableHead className="bg-muted/40 text-right text-xs">Opening stock</TableHead>
                        <TableHead className="bg-muted/40 pr-4 text-xs">Validation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.rows.map((r) => {
                        const ok = r.errors.length === 0;
                        const checked = ok && !deselected.has(r.line);
                        const stockTotal = Object.values(r.stock).reduce((a, b) => a + b, 0);
                        return (
                          <TableRow key={r.line} className={cn(!ok && "bg-error-light/30 hover:bg-error-light/40")}>
                            <TableCell className="pl-4">
                              <Checkbox
                                aria-label={`Import row ${r.line}`}
                                checked={checked}
                                disabled={!ok}
                                onCheckedChange={(v) =>
                                  setDeselected((prev) => {
                                    const n = new Set(prev);
                                    if (v) n.delete(r.line);
                                    else n.add(r.line);
                                    return n;
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground tabular-nums">{r.line}</TableCell>
                            <TableCell className="font-mono text-xs whitespace-nowrap">{r.sku || "—"}</TableCell>
                            <TableCell className="min-w-44">
                              <span className="font-medium">{r.name || <span className="text-muted-foreground">—</span>}</span>
                              {r.nameKm && (
                                <span lang="km" className="block text-xs text-muted-foreground">
                                  {r.nameKm}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-36">
                              {r.categoryId ? (
                                <span>{cats.find((c) => c.id === r.categoryId)?.name}</span>
                              ) : (
                                <div className="space-y-1">
                                  <span className="text-muted-foreground line-through decoration-error-text/60">{r.categoryInput || "—"}</span>
                                  {r.suggestion && (
                                    <Button variant="outline" size="xs" onClick={() => setOverrides((o) => ({ ...o, [r.line]: r.suggestion!.id }))}>
                                      Use “{r.suggestion.name}”
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{r.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.sellingPrice !== null ? formatMoney(r.sellingPrice, r.currency) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{r.costPrice !== null ? formatMoney(r.costPrice, r.currency) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.reorderLevel}</TableCell>
                            <TableCell className="text-right tabular-nums" title={Object.entries(r.stock).map(([b, q]) => `${allBranches.find((x) => x.id === b)?.code}: ${q}`).join(", ")}>
                              {stockTotal > 0 ? `${formatNumber(stockTotal)} · ${Object.keys(r.stock).length} br.` : "—"}
                            </TableCell>
                            <TableCell className="min-w-56 pr-4">
                              {ok && r.warnings.length === 0 && (
                                <span className="inline-flex items-center gap-1 text-xs text-success-text">
                                  <CheckCircle2 className="size-3.5" aria-hidden /> Ready
                                </span>
                              )}
                              <ul className="space-y-0.5">
                                {r.errors.map((e) => (
                                  <li key={e} className="flex items-start gap-1 text-xs text-error-text">
                                    <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                                    <span>
                                      <span className="sr-only">Error: </span>
                                      {e}
                                    </span>
                                  </li>
                                ))}
                                {r.warnings.map((w) => (
                                  <li key={w} className="flex items-start gap-1 text-xs text-warning-text">
                                    <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                                    <span>
                                      <span className="sr-only">Warning: </span>
                                      {w}
                                    </span>
                                  </li>
                                ))}
                                {overrides[r.line] && (
                                  <li className="flex items-center gap-1 text-xs text-muted-foreground">
                                    Category matched from “{r.categoryInput}”
                                    <Button
                                      variant="link"
                                      size="xs"
                                      className="h-auto px-1"
                                      onClick={() =>
                                        setOverrides((o) => {
                                          const n = { ...o };
                                          delete n[r.line];
                                          return n;
                                        })
                                      }
                                    >
                                      Undo
                                    </Button>
                                  </li>
                                )}
                              </ul>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  <span className="font-medium text-foreground tabular-nums">{selected.length}</span> of {validation.rows.length} rows selected
                  {totalStockUnits > 0 && ` · ${formatNumber(totalStockUnits)} opening units`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={reset}>
                    <RotateCcw /> Choose another file
                  </Button>
                  <Button onClick={() => setConfirmOpen(true)} disabled={selected.length === 0}>
                    Import {selected.length} item{selected.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {step === 2 && result && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-success-light text-success-text">
                <CheckCircle2 className="size-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold">
                {result.length} item{result.length === 1 ? "" : "s"} imported
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {errorRows > 0 ? `${errorRows} row${errorRows === 1 ? " was" : "s were"} skipped because of errors. ` : ""}
                Opening stock was recorded as “Initial” movements for each branch.
              </p>
            </div>
            <ul className="mx-auto mt-6 max-w-2xl divide-y rounded-lg border">
              {result.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <Link href={`/items/${it.id}`} className="min-w-0 truncate hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{it.sku}</span> <span className="font-medium">{it.name}</span>
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatNumber(Object.values(it.stock).reduce((a, b) => a + b, 0))} {it.unit} on hand
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={reset}>
                <Upload /> Import another file
              </Button>
              <Button asChild>
                <Link href="/items">View all items</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Import ${selected.length} item${selected.length === 1 ? "" : "s"}?`}
        description={`This creates ${selected.length} new item${selected.length === 1 ? "" : "s"}${totalStockUnits > 0 ? ` and records ${formatNumber(totalStockUnits)} units of opening stock` : ""}. ${validation && validation.rows.length - selected.length > 0 ? `${validation.rows.length - selected.length} row(s) will be skipped.` : ""}`}
        confirmLabel="Import items"
        onConfirm={() => doImport.run()}
      />
    </>
  );
}
