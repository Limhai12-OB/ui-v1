"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, ArrowRight, BellRing, Loader2 } from "lucide-react";
import type { Item, StockAdjustmentType } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { stockService } from "@/lib/api";
import { formatNumber } from "@/lib/currency";
import { stockLevel } from "@/lib/domain";
import { formatDate, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field, FormSection, fieldDescribedBy } from "@/components/forms/field";
import { BranchSelect } from "@/components/forms/entity-selects";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADJUSTMENT_META, REASON_CODES, SignedQty } from "./inventory-shared";
import { ItemCombobox } from "./item-combobox";

const TYPES: StockAdjustmentType[] = ["increase", "decrease", "correction"];

function computeNew(type: StockAdjustmentType, current: number, qty: number): number {
  return type === "increase" ? current + qty : type === "decrease" ? current - qty : qty;
}

export function StockAdjustmentNewPage() {
  const canManage = useCan("items.manage");
  if (!canManage)
    return (
      <EmptyState
        title="You can't adjust stock"
        action={
          <Button asChild>
            <Link href="/stock-adjustments">Back</Link>
          </Button>
        }
      />
    );
  return <AdjustmentForm />;
}

function AdjustmentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const items = useAppStore((s) => s.items);
  const { branches, branch, isOwner, user } = useScope();
  const [saved, setSaved] = useState(false);

  const prefillItem = params.get("item");
  const prefillBranch = params.get("branch");
  const defaultBranch =
    (prefillBranch && branches.some((b) => b.id === prefillBranch) ? prefillBranch : undefined) ?? branch?.id ?? (!isOwner ? user.branchId : undefined) ?? "";

  const schema = useMemo(
    () =>
      z
        .object({
          itemId: z.string().min(1, "Choose an item"),
          branchId: z.string().min(1, "Choose a branch"),
          type: z.enum(["increase", "decrease", "correction"]),
          quantity: z.number({ message: "Enter a quantity" }).int("Whole numbers only").min(0, "Can't be negative").max(1_000_000, "That's too large"),
          reason: z.string().min(1, "Choose a reason"),
          note: z.string().trim().max(240, "Keep the note under 240 characters").optional(),
        })
        .superRefine((v, ctx) => {
          const it = items.find((i) => i.id === v.itemId);
          const cur = it?.stock[v.branchId] ?? 0;
          if (v.type !== "correction" && v.quantity === 0) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Quantity must be greater than zero" });
          if (v.type === "decrease" && it && v.quantity > cur) ctx.addIssue({ code: "custom", path: ["quantity"], message: `Can't remove more than the ${cur} ${it.unit} on hand` });
          if (v.type === "correction" && it && v.quantity === cur) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Counted quantity matches the system — no correction needed" });
          if (v.reason === "Other" && !v.note?.trim()) ctx.addIssue({ code: "custom", path: ["note"], message: "Describe the reason when choosing “Other”" });
        }),
    [items],
  );
  type FormValues = z.infer<typeof schema>;

  const validPrefill = prefillItem && items.some((i) => i.id === prefillItem) ? prefillItem : "";
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { itemId: validPrefill, branchId: defaultBranch, type: "increase", quantity: undefined as unknown as number, reason: "", note: "" },
  });
  const { control, register, handleSubmit, formState, setValue, trigger } = form;
  const { errors } = formState;
  const [itemId, branchId, type, quantity, reason] = useWatch({ control, name: ["itemId", "branchId", "type", "quantity", "reason"] });
  const item: Item | undefined = items.find((i) => i.id === itemId);
  const current = item && branchId ? (item.stock[branchId] ?? 0) : undefined;
  const qty = Number.isFinite(quantity) ? quantity : undefined;
  const next = current !== undefined && qty !== undefined ? computeNew(type, current, qty) : undefined;
  const change = next !== undefined && current !== undefined ? next - current : undefined;
  const willAlert = item && next !== undefined && change !== undefined && change < 0 && next <= item.reorderLevel && item.status === "active";
  const atOrBelow = item && next !== undefined && next <= item.reorderLevel;

  // reset reason when the type changes (codes differ per type)
  useEffect(() => {
    if (reason && !REASON_CODES[type].includes(reason)) setValue("reason", "", { shouldDirty: true });
  }, [type, reason, setValue]);

  // re-validate quantity when its context changes
  useEffect(() => {
    if (formState.touchedFields.quantity) void trigger("quantity");
  }, [type, itemId, branchId, trigger, formState.touchedFields.quantity]);

  const save = useAction(
    (v: FormValues) => stockService.adjust({ itemId: v.itemId, branchId: v.branchId, date: today(), type: v.type, quantity: v.quantity, reason: v.reason, note: v.note?.trim() || undefined }),
    {
      success: (a) => `${a.number} recorded — ${items.find((i) => i.id === a.itemId)?.name ?? "item"} now ${formatNumber(a.newQuantity)} on hand`,
      onSuccess: () => {
        setSaved(true);
        router.push("/stock-adjustments");
      },
    },
  );

  const activeItems = useMemo(() => [...items].sort((a, b) => a.sku.localeCompare(b.sku)), [items]);
  const qtyLabel = type === "correction" ? "Counted quantity" : type === "increase" ? "Quantity to add" : "Quantity to remove";

  return (
    <>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
      <PageHeader
        backHref={validPrefill ? `/items/${validPrefill}` : "/stock-adjustments"}
        backLabel={validPrefill ? (item?.name ?? "Item") : "Stock adjustments"}
        title="New stock adjustment"
        description={`Dated ${formatDate(today())}. The change is applied immediately and recorded in the item's movement history.`}
      />
      <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card className="gap-0 px-6 py-0">
            <FormSection title="Item & branch" description={isOwner ? "Stock is tracked per branch." : "You can adjust stock for your branch only."}>
              <Field label="Item" htmlFor="adj-item" required error={errors.itemId?.message} className="sm:col-span-2">
                <Controller
                  control={control}
                  name="itemId"
                  render={({ field }) => (
                    <ItemCombobox
                      id="adj-item"
                      items={activeItems}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        field.onBlur();
                      }}
                      invalid={!!errors.itemId}
                      renderMeta={(i) => (branchId ? `${formatNumber(i.stock[branchId] ?? 0)} ${i.unit} on hand${i.status === "inactive" ? " · inactive" : ""}` : i.status === "inactive" ? "Inactive" : `Sold per ${i.unit}`)}
                    />
                  )}
                />
              </Field>
              <Field label="Branch" htmlFor="adj-branch" required error={errors.branchId?.message}>
                <Controller control={control} name="branchId" render={({ field }) => <BranchSelect id="adj-branch" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!errors.branchId} />} />
              </Field>
              <div className="flex items-end">
                {item && current !== undefined && (
                  <p className="flex items-center gap-2 pb-2 text-sm">
                    <span className="text-muted-foreground">On hand:</span>
                    <span className="font-semibold tabular-nums">
                      {formatNumber(current)} {item.unit}
                    </span>
                    <StatusBadge status={stockLevel(current, item.reorderLevel)} />
                  </p>
                )}
              </div>
            </FormSection>

            <FormSection title="Adjustment type" description="Pick what happened to the stock.">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <div role="radiogroup" aria-label="Adjustment type" className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                    {TYPES.map((t) => {
                      const m = ADJUSTMENT_META[t];
                      const Icon = m.icon;
                      const checked = field.value === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          onClick={() => field.onChange(t)}
                          onKeyDown={(e) => {
                            const i = TYPES.indexOf(field.value);
                            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                              e.preventDefault();
                              field.onChange(TYPES[(i + 1) % 3]);
                            }
                            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                              e.preventDefault();
                              field.onChange(TYPES[(i + 2) % 3]);
                            }
                          }}
                          tabIndex={checked ? 0 : -1}
                          className={cn(
                            "flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
                            checked && "border-primary bg-primary-light/40 ring-1 ring-primary",
                          )}
                        >
                          <span className={cn("flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground", checked && "bg-primary text-primary-foreground")}>
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="text-sm font-semibold">{m.label}</span>
                          <span className="text-xs text-muted-foreground">{m.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </FormSection>

            <FormSection title="Quantity & reason" description="The reason is shown in the movement history and audit trail.">
              <Field
                label={qtyLabel}
                htmlFor="adj-qty"
                required
                error={errors.quantity?.message}
                helper={type === "correction" ? "Enter what you physically counted." : type === "decrease" && current !== undefined ? `Up to ${formatNumber(current)} available.` : undefined}
              >
                <Input
                  id="adj-qty"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={type === "decrease" ? current : undefined}
                  step={1}
                  className="tabular-nums"
                  {...register("quantity", { valueAsNumber: true })}
                  aria-invalid={!!errors.quantity}
                  aria-describedby={fieldDescribedBy("adj-qty", !!errors.quantity)}
                />
              </Field>
              <Field label="Reason" htmlFor="adj-reason" required error={errors.reason?.message}>
                <Controller
                  control={control}
                  name="reason"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={(v) => { field.onChange(v); field.onBlur(); }}>
                      <SelectTrigger id="adj-reason" className="w-full" aria-invalid={!!errors.reason}>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {REASON_CODES[type].map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Note" htmlFor="adj-note" error={errors.note?.message} helper={reason === "Other" ? "Required for “Other”." : "Optional — supplier, batch, who counted, etc."} className="sm:col-span-2">
                <Textarea id="adj-note" rows={2} {...register("note")} aria-invalid={!!errors.note} aria-describedby={fieldDescribedBy("adj-note", !!errors.note)} />
              </Field>
            </FormSection>
          </Card>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <div className="px-5">
                <h2 className="text-sm font-semibold">Preview</h2>
                <div className="mt-4" aria-live="polite">
                  {item && current !== undefined ? (
                    <>
                      <p className="text-xs text-muted-foreground">{item.name}</p>
                      <div className="mt-2 flex items-center gap-3 text-2xl font-semibold tabular-nums">
                        <span className="text-muted-foreground">{formatNumber(current)}</span>
                        <ArrowRight className="size-5 text-muted-foreground" aria-label="becomes" />
                        <span>{next !== undefined ? formatNumber(next) : "—"}</span>
                        <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
                      </div>
                      <p className="mt-1 text-sm">
                        Change: {change !== undefined ? <SignedQty value={change} /> : <span className="text-muted-foreground">enter a quantity</span>}
                      </p>
                      {next !== undefined && next < 0 && (
                        <p className="mt-3 flex items-start gap-1.5 text-xs text-error-text" role="alert">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Stock can&rsquo;t go below zero.
                        </p>
                      )}
                      {next !== undefined && next >= 0 && atOrBelow && (
                        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light p-3 text-xs text-warning-text">
                          {willAlert ? <BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                          <p>
                            {next <= 0 ? "This leaves the item out of stock" : `This is at or below the reorder level of ${item.reorderLevel}`}.{" "}
                            {willAlert ? "A low-stock notification will be raised for this branch." : "The item will stay flagged as low stock."}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Choose an item and branch to preview the change.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t px-5 pt-4">
                <Button type="submit" disabled={save.pending}>
                  {save.pending && <Loader2 className="animate-spin" />}
                  Record adjustment
                </Button>
                <Button type="button" variant="ghost" asChild>
                  <Link href={validPrefill ? `/items/${validPrefill}` : "/stock-adjustments"}>Cancel</Link>
                </Button>
              </div>
            </Card>
          </aside>
        </div>
      </form>
    </>
  );
}
