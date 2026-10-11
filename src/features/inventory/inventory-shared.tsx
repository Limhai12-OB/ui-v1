"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  PackageOpen,
  RefreshCcw,
  ShoppingCart,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { Currency, ID, Item, StockAdjustmentType, StockMovementType } from "@/types";
import { useAppStore } from "@/store/app-store";
import { aggregateMoney, formatNumber } from "@/lib/currency";
import { stockLevel, type StockLevel } from "@/lib/domain";
import type { ConvertedSum } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Movement & adjustment type metadata                                 */
/* ------------------------------------------------------------------ */

type BadgeTone = "success" | "warning" | "error" | "info" | "neutral" | "ai" | "outline";

export const MOVEMENT_META: Record<StockMovementType, { label: string; icon: LucideIcon; tone: BadgeTone }> = {
  initial: { label: "Initial", icon: PackageOpen, tone: "neutral" },
  sale: { label: "Sale", icon: ShoppingCart, tone: "info" },
  increase: { label: "Increase", icon: ArrowUpRight, tone: "success" },
  decrease: { label: "Decrease", icon: ArrowDownRight, tone: "warning" },
  correction: { label: "Correction", icon: RefreshCcw, tone: "ai" },
  invoice: { label: "Invoice", icon: FileText, tone: "info" },
  import: { label: "Import", icon: Upload, tone: "neutral" },
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  const m = MOVEMENT_META[type];
  const Icon = m.icon;
  return (
    <Badge variant={m.tone} className="gap-1">
      <Icon aria-hidden /> {m.label}
    </Badge>
  );
}

export const ADJUSTMENT_META: Record<StockAdjustmentType, { label: string; short: string; description: string; icon: LucideIcon; tone: BadgeTone }> = {
  increase: { label: "Stock Increase", short: "Increase", description: "Received or returned goods — adds to on-hand quantity.", icon: ArrowUpRight, tone: "success" },
  decrease: { label: "Stock Decrease", short: "Decrease", description: "Damaged, expired or lost goods — removes from on-hand quantity.", icon: ArrowDownRight, tone: "warning" },
  correction: { label: "Stock Correction", short: "Correction", description: "Enter the counted quantity; the system works out the difference.", icon: RefreshCcw, tone: "ai" },
};

export function AdjustmentTypeBadge({ type }: { type: StockAdjustmentType }) {
  const m = ADJUSTMENT_META[type];
  const Icon = m.icon;
  return (
    <Badge variant={m.tone} className="gap-1">
      <Icon aria-hidden /> {m.short}
    </Badge>
  );
}

export const REASON_CODES: Record<StockAdjustmentType, string[]> = {
  increase: ["Supplier delivery received", "Customer return", "Transfer received from another branch", "Found during stock count", "Other"],
  decrease: ["Damaged", "Expired stock removed", "Lost or stolen", "Breakage", "Internal use", "Transfer to another branch", "Other"],
  correction: ["Cycle count variance", "Quarterly stock take", "Data entry error", "Other"],
};

export const UNITS = ["pcs", "pack", "bottle", "can", "case", "bag", "box", "tray", "kg", "L"] as const;

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                         */
/* ------------------------------------------------------------------ */

/** Signed quantity with arrow-free +/− sign and tone (sign carries meaning, not color alone). */
export function SignedQty({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-medium tabular-nums", value > 0 && "text-success-text", value < 0 && "text-error-text", className)}>
      {value > 0 ? "+" : value < 0 ? "−" : "±"}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

export function marginPercent(selling: number, cost: number): number | null {
  if (!selling || selling <= 0) return null;
  return ((selling - cost) / selling) * 100;
}

export function MarginValue({ selling, cost, className }: { selling: number; cost: number; className?: string }) {
  const m = marginPercent(selling, cost);
  if (m === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return <span className={cn("tabular-nums", m < 0 && "font-medium text-error-text", className)}>{m.toFixed(1)}%</span>;
}

/* ------------------------------------------------------------------ */
/* Derived stock helpers                                                */
/* ------------------------------------------------------------------ */

export function stockIn(item: Item, branchIds: ID[]): number {
  return branchIds.reduce((s, b) => s + (item.stock[b] ?? 0), 0);
}

const LEVEL_RANK: Record<StockLevel, number> = { ok: 0, low: 1, out: 2 };

/** Worst stock level across the given branches, plus how many branches are at that level. */
export function worstLevel(item: Item, branchIds: ID[]): { level: StockLevel; count: number } {
  let level: StockLevel = "ok";
  let count = 0;
  for (const b of branchIds) {
    const l = stockLevel(item.stock[b] ?? 0, item.reorderLevel);
    if (LEVEL_RANK[l] > LEVEL_RANK[level]) {
      level = l;
      count = 1;
    } else if (l === level && l !== "ok") count++;
  }
  return { level, count };
}

/** Stock value at cost for the given branches, in the display currency (converted only with the configured rate). */
export function stockValue(items: Item[], branchIds: ID[], display: Currency, rate: number | null): ConvertedSum {
  const agg = aggregateMoney(
    items.map((i) => ({ amount: i.costPrice * stockIn(i, branchIds), currency: i.currency })),
    display,
    rate,
  );
  return { value: agg.total ?? agg.byCurrency[display], converted: agg.converted, excludedForeign: agg.total === null };
}

export function toConvertedSum(values: { amount: number; currency: Currency }[], display: Currency, rate: number | null): ConvertedSum {
  const agg = aggregateMoney(values, display, rate);
  return { value: agg.total ?? agg.byCurrency[display], converted: agg.converted, excludedForeign: agg.total === null };
}

/** Item categories (kind = "item"). */
export function useItemCategories() {
  const categories = useAppStore((s) => s.categories);
  return useMemo(() => categories.filter((c) => c.kind === "item"), [categories]);
}
