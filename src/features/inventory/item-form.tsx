"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2, PackageSearch, SlidersHorizontal } from "lucide-react";
import type { Currency, Item } from "@/types";
import type { NewItem } from "@/store/app-store";
import { useAppStore } from "@/store/app-store";
import { useCan, useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { itemService } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/currency";
import { stockLevel } from "@/lib/domain";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field, FormSection, fieldDescribedBy } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { CategorySelect, CurrencySelect } from "@/components/forms/entity-selects";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarginValue, UNITS, marginPercent } from "./inventory-shared";

const SKU_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function buildSchema(existingSkus: Set<string>) {
  const price = z
    .union([z.number(), z.literal("")])
    .refine((v): v is number => typeof v === "number" && Number.isFinite(v), "Enter a price")
    .refine((v) => v >= 0, "Price can't be negative");
  return z.object({
    sku: z
      .string()
      .trim()
      .min(3, "SKU must be at least 3 characters")
      .max(20, "Keep SKU under 20 characters")
      .regex(SKU_RE, "Use uppercase letters, digits and dashes, e.g. BEV-007")
      .refine((v) => !existingSkus.has(v.toUpperCase()), "This SKU is already used by another item"),
    name: z.string().trim().min(2, "Enter the item name").max(80, "Keep it under 80 characters"),
    nameKm: z.string().trim().max(80).optional(),
    categoryId: z.string().min(1, "Choose a category"),
    unit: z.string().min(1, "Choose a unit"),
    barcode: z
      .string()
      .trim()
      .regex(/^(\d{8,14})?$/, "Barcode must be 8–14 digits")
      .optional(),
    currency: z.enum(["USD", "KHR"]),
    sellingPrice: price,
    costPrice: price,
    reorderLevel: z.number({ message: "Enter a reorder level" }).int("Whole numbers only").min(0, "Can't be negative").max(100000),
    initialStock: z.array(z.object({ branchId: z.string(), enabled: z.boolean(), qty: z.number({ message: "Enter a quantity" }).int("Whole numbers only").min(0, "Can't be negative").max(1_000_000) })),
    active: z.boolean(),
  });
}
type FormInput = z.input<ReturnType<typeof buildSchema>>;
type FormValues = z.output<ReturnType<typeof buildSchema>>;

export function ItemFormPage({ itemId }: { itemId?: string }) {
  const items = useAppStore((s) => s.items);
  const item = itemId ? items.find((i) => i.id === itemId) : undefined;
  const canManage = useCan("items.manage");

  if (itemId && !item) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Item not found"
        description="It may have been removed or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/items">Back to items</Link>
          </Button>
        }
      />
    );
  }
  if (!canManage) {
    return <EmptyState title="You can't edit items" description="Ask the Business Owner for access." action={<Button asChild><Link href="/items">Back to items</Link></Button>} />;
  }
  return <ItemForm key={item?.id ?? "new"} item={item} />;
}

function ItemForm({ item }: { item?: Item }) {
  const router = useRouter();
  const items = useAppStore((s) => s.items);
  const { branches, scope, branch, isOwner } = useScope();
  const editing = !!item;
  const [saved, setSaved] = useState(false);

  const existingSkus = useMemo(() => new Set(items.filter((i) => i.id !== item?.id).map((i) => i.sku.toUpperCase())), [items, item?.id]);
  const schema = useMemo(() => buildSchema(existingSkus), [existingSkus]);
  const activeBranches = branches.filter((b) => b.status === "active");

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: item
      ? {
          sku: item.sku,
          name: item.name,
          nameKm: item.nameKm ?? "",
          categoryId: item.categoryId,
          unit: item.unit,
          barcode: item.barcode ?? "",
          currency: item.currency,
          sellingPrice: item.sellingPrice,
          costPrice: item.costPrice,
          reorderLevel: item.reorderLevel,
          initialStock: [],
          active: item.status === "active",
        }
      : {
          sku: "",
          name: "",
          nameKm: "",
          categoryId: "",
          unit: "pcs",
          barcode: "",
          currency: "USD",
          sellingPrice: "",
          costPrice: "",
          reorderLevel: 10,
          initialStock: activeBranches.map((b) => ({ branchId: b.id, enabled: branch ? b.id === branch.id : !isOwner || b.isMain, qty: 0 })),
          active: true,
        },
  });
  const { register, handleSubmit, control, formState, setValue } = form;
  const { errors } = formState;
  const { fields } = useFieldArray({ control, name: "initialStock" });
  const [currency, selling, cost, initialStock] = useWatch({ control, name: ["currency", "sellingPrice", "costPrice", "initialStock"] });
  const sellNum = typeof selling === "number" ? selling : 0;
  const costNum = typeof cost === "number" ? cost : 0;
  const belowCost = typeof selling === "number" && typeof cost === "number" && selling < cost;
  const margin = marginPercent(sellNum, costNum);

  const save = useAction(
    async (v: FormValues): Promise<Item | undefined> => {
      const base = {
        sku: v.sku.trim().toUpperCase(),
        name: v.name.trim(),
        nameKm: v.nameKm?.trim() || undefined,
        categoryId: v.categoryId,
        unit: v.unit,
        barcode: v.barcode?.trim() || undefined,
        currency: v.currency as Currency,
        sellingPrice: Number(v.sellingPrice),
        costPrice: Number(v.costPrice),
        reorderLevel: v.reorderLevel,
        status: (v.active ? "active" : "inactive") as Item["status"],
      };
      if (editing) {
        await itemService.update(item!.id, base);
        return item;
      }
      const initial: NewItem["initialStock"] = {};
      for (const s of v.initialStock) if (s.enabled && s.qty > 0) initial[s.branchId] = s.qty;
      return itemService.create({ ...base, initialStock: initial });
    },
    {
      success: editing ? "Item updated" : (r) => `Item ${r?.sku} created`,
      onSuccess: (r) => {
        setSaved(true);
        router.push(`/items/${r?.id ?? item?.id}`);
      },
    },
  );

  const totalInitial = (initialStock ?? []).reduce((s, x) => s + (x.enabled ? Number(x.qty) || 0 : 0), 0);

  return (
    <>
      <UnsavedChangesGuard when={formState.isDirty && !saved} />
      <PageHeader
        backHref={editing ? `/items/${item!.id}` : "/items"}
        backLabel={editing ? item!.name : "Items"}
        title={editing ? `Edit ${item!.sku}` : "New item"}
        description={editing ? "Changes apply to this item in every branch. Stock levels are changed through stock adjustments." : "Item master data is shared by all branches."}
      />
      <form onSubmit={handleSubmit((v) => save.fire(v))} noValidate>
        <Card className="gap-0 px-6 py-0">
          <FormSection title="Basic information" description="How the item is identified on receipts, invoices and imports.">
            <Field label="SKU" htmlFor="sku" required error={errors.sku?.message} helper="Uppercase letters, digits and dashes.">
              <Input
                id="sku"
                className="font-mono uppercase"
                autoComplete="off"
                {...register("sku", { setValueAs: (v: string) => v.toUpperCase() })}
                onChange={(e) => setValue("sku", e.target.value.toUpperCase().replace(/\s+/g, "-"), { shouldDirty: true, shouldValidate: formState.touchedFields.sku })}
                aria-invalid={!!errors.sku}
                aria-describedby={fieldDescribedBy("sku", !!errors.sku)}
                placeholder="BEV-007"
              />
            </Field>
            <Field label="Barcode" htmlFor="barcode" error={errors.barcode?.message} helper="Optional EAN / UPC.">
              <Input id="barcode" inputMode="numeric" {...register("barcode")} aria-invalid={!!errors.barcode} aria-describedby={fieldDescribedBy("barcode", !!errors.barcode)} />
            </Field>
            <Field label="Name" htmlFor="name" required error={errors.name?.message}>
              <Input id="name" {...register("name")} aria-invalid={!!errors.name} aria-describedby={fieldDescribedBy("name", !!errors.name)} placeholder="e.g. Coconut Water 330ml" />
            </Field>
            <Field label="Khmer name" htmlFor="nameKm" helper="Optional — printed on Khmer receipts.">
              <Input id="nameKm" lang="km" {...register("nameKm")} />
            </Field>
            <Field label="Category" htmlFor="categoryId" required error={errors.categoryId?.message} helper={<>Manage item categories in <Link href="/categories" className="underline">Categories</Link>.</>}>
              <Controller control={control} name="categoryId" render={({ field }) => <CategorySelect id="categoryId" kind="item" value={field.value || undefined} onChange={field.onChange} aria-invalid={!!errors.categoryId} />} />
            </Field>
            <Field label="Unit" htmlFor="unit" required error={errors.unit?.message}>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="unit" className="w-full">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...UNITS, field.value].filter(Boolean))).map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </FormSection>

          <FormSection title="Pricing" description="Margin is calculated on the selling price.">
            <Field label="Currency" htmlFor="currency" required helper="Walk-in sales use one currency per receipt.">
              <Controller control={control} name="currency" render={({ field }) => <CurrencySelect id="currency" value={field.value} onChange={field.onChange} />} />
            </Field>
            <div className="hidden sm:block" />
            <Field label="Selling price" htmlFor="sellingPrice" required error={errors.sellingPrice?.message}>
              <Controller
                control={control}
                name="sellingPrice"
                render={({ field }) => (
                  <MoneyInput id="sellingPrice" currency={currency} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.sellingPrice} aria-describedby={fieldDescribedBy("sellingPrice", !!errors.sellingPrice)} />
                )}
              />
            </Field>
            <Field label="Cost price" htmlFor="costPrice" required error={errors.costPrice?.message}>
              <Controller
                control={control}
                name="costPrice"
                render={({ field }) => (
                  <MoneyInput id="costPrice" currency={currency} value={field.value} onValueChange={field.onChange} onBlur={field.onBlur} aria-invalid={!!errors.costPrice} aria-describedby={fieldDescribedBy("costPrice", !!errors.costPrice)} />
                )}
              />
            </Field>
            <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2" aria-live="polite">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  Margin: <MarginValue selling={sellNum} cost={costNum} className="font-semibold text-foreground" />
                </span>
                <span className="text-muted-foreground">
                  Profit per unit: <span className="font-semibold text-foreground tabular-nums">{formatMoney(sellNum - costNum, currency)}</span>
                </span>
              </div>
              {belowCost && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-text">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  The selling price is below cost — every sale of this item will lose money. You can still save it (e.g. for a clearance).
                </p>
              )}
              {margin !== null && margin >= 0 && margin < 10 && !belowCost && <p className="mt-2 text-xs text-muted-foreground">Margin is under 10%. Check the price covers handling and spoilage.</p>}
            </div>
          </FormSection>

          <FormSection title="Inventory" description={editing ? "Reorder level drives low-stock alerts in every branch." : "Set the reorder level and the opening quantity for each branch."}>
            <Field label="Reorder level" htmlFor="reorderLevel" required error={errors.reorderLevel?.message} helper="Raise a low-stock alert when on-hand falls to this quantity.">
              <Input id="reorderLevel" type="number" min={0} step={1} className="tabular-nums" {...register("reorderLevel", { valueAsNumber: true })} aria-invalid={!!errors.reorderLevel} aria-describedby={fieldDescribedBy("reorderLevel", !!errors.reorderLevel)} />
            </Field>
            <div className="hidden sm:block" />
            {editing ? (
              <div className="sm:col-span-2">
                <p className="mb-2 text-[13px] font-medium">Current stock</p>
                <ul className="divide-y rounded-lg border">
                  {branches
                    .filter((b) => scope.branchIds.includes(b.id))
                    .map((b) => {
                      const q = item!.stock[b.id] ?? 0;
                      return (
                        <li key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span>{b.name}</span>
                          <span className="flex items-center gap-3">
                            <span className="tabular-nums">
                              {formatNumber(q)} {item!.unit}
                            </span>
                            <StatusBadge status={stockLevel(q, item!.reorderLevel)} />
                          </span>
                        </li>
                      );
                    })}
                </ul>
                <Button variant="link" size="sm" asChild className="mt-1 px-0">
                  <Link href={`/stock-adjustments/new?item=${item!.id}`}>
                    <SlidersHorizontal /> Adjust stock
                  </Link>
                </Button>
              </div>
            ) : (
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-[13px] font-medium">Initial stock by branch</legend>
                <div className="divide-y rounded-lg border">
                  {fields.map((f, idx) => {
                    const b = activeBranches.find((x) => x.id === f.branchId);
                    const enabled = initialStock?.[idx]?.enabled;
                    const err = errors.initialStock?.[idx]?.qty?.message;
                    return (
                      <div key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <Controller
                          control={control}
                          name={`initialStock.${idx}.enabled`}
                          render={({ field }) => <Checkbox id={`stock-${f.branchId}`} checked={field.value} onCheckedChange={(v) => field.onChange(!!v)} />}
                        />
                        <label htmlFor={`stock-${f.branchId}`} className="min-w-40 flex-1 text-sm">
                          {b?.name}
                          <span className="ml-2 text-xs text-muted-foreground">{b?.code}</span>
                        </label>
                        <div className="w-36">
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            disabled={!enabled}
                            aria-label={`Initial quantity at ${b?.name}`}
                            className="text-right tabular-nums"
                            {...register(`initialStock.${idx}.qty`, { valueAsNumber: true })}
                            aria-invalid={!!err}
                          />
                        </div>
                        {err && (
                          <p role="alert" className="w-full text-right text-xs text-destructive">
                            {err}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {totalInitial > 0 ? `${formatNumber(totalInitial)} units will be recorded as “Initial” stock movements dated today.` : "No opening stock — the item starts at 0 in every branch."}
                  {!isOwner && " You can only set opening stock for your branch."}
                </p>
              </fieldset>
            )}
          </FormSection>

          <FormSection title="Status" description="Inactive items are hidden from the walk-in sale screen and don't raise stock alerts.">
            <div className="flex items-start gap-3 sm:col-span-2">
              <Controller control={control} name="active" render={({ field }) => <Switch id="active" checked={field.value} onCheckedChange={field.onChange} />} />
              <label htmlFor="active" className="text-sm">
                <span className="font-medium">Active</span>
                <span className="block text-xs text-muted-foreground">Available for sale and included in stock reports.</span>
              </label>
            </div>
          </FormSection>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl sm:border-x-0 sm:px-0">
          <Button type="button" variant="outline" asChild>
            <Link href={editing ? `/items/${item!.id}` : "/items"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.pending || (editing && !formState.isDirty)}>
            {save.pending && <Loader2 className="animate-spin" />}
            {editing ? "Save changes" : "Create item"}
          </Button>
        </div>
      </form>
    </>
  );
}
