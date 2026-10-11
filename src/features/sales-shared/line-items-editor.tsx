"use client";

import { useEffect, useMemo, useRef } from "react";
import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { AlertTriangle, Info, Plus, Trash2 } from "lucide-react";
import type { Currency } from "@/types";
import { useAppStore } from "@/store/app-store";
import { documentTotals } from "@/lib/domain";
import { CURRENCY_META, roundMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";
import { ItemCombobox } from "./item-combobox";
import { emptyLine, itemPrice, stockShortfalls, VAT_RATE, type LinesForm } from "./lines";

interface LineItemsEditorProps {
  form: UseFormReturn<LinesForm>;
  /** Show the VAT toggle (invoices). Planned purchases are estimates without tax. */
  showTax?: boolean;
  totalLabel?: string;
  /** Explains what stock shortfalls mean for this document. */
  stockHint?: string;
}

const GRID = "md:grid-cols-[150px_minmax(0,1fr)_88px_140px_120px_36px]";

/**
 * Line items + totals for invoices and planned purchases.
 * Rows link to stock items (fills description and price, shows stock at the
 * document branch) or are free text. Enter on qty/price jumps to the next row.
 */
export function LineItemsEditor({ form, showTax = true, totalLabel = "Total", stockHint = "Sending deducts stock from this branch." }: LineItemsEditorProps) {
  const { control, register, setValue, setFocus, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const items = useAppStore((s) => s.items);
  const rate = useAppStore((s) => s.business.khrPerUsd);
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const currency = useWatch({ control, name: "currency" }) as Currency;
  const branchId = useWatch({ control, name: "branchId" });
  const discount = useWatch({ control, name: "discount" });
  const taxEnabled = useWatch({ control, name: "taxEnabled" });

  // Reprice stock-item lines when the document currency changes.
  const prevCurrency = useRef(currency);
  useEffect(() => {
    if (prevCurrency.current === currency) return;
    prevCurrency.current = currency;
    form.getValues("lines").forEach((l, i) => {
      const item = l.itemId ? items.find((x) => x.id === l.itemId) : undefined;
      const price = item ? itemPrice(item, currency, rate) : null;
      if (price !== null) setValue(`lines.${i}.unitPrice`, price, { shouldDirty: true, shouldValidate: true });
    });
  }, [currency, form, items, rate, setValue]);

  const safeLines = lines.map((l) => ({ id: "", description: l?.description ?? "", quantity: Number.isFinite(l?.quantity) ? l.quantity : 0, unitPrice: Number.isFinite(l?.unitPrice) ? l.unitPrice : 0, itemId: l?.itemId }));
  const totals = documentTotals(safeLines, Number.isFinite(discount) ? discount : 0, showTax && taxEnabled ? VAT_RATE : 0, currency);
  const shortfalls = useMemo(() => stockShortfalls(safeLines, items, branchId), [safeLines, items, branchId]);
  const errors = formState.errors.lines;
  const arrayError = errors?.message ?? errors?.root?.message;
  const noRate = currency === "KHR" && !rate;

  const addRow = () => {
    append(emptyLine(), { shouldFocus: false });
    setTimeout(() => setFocus(`lines.${fields.length}.description`), 0);
  };
  const onEnter = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (i === fields.length - 1) addRow();
    else setFocus(`lines.${i + 1}.description`);
  };

  return (
    <div className="space-y-4">
      <div className={cn("hidden gap-2 px-1 text-xs font-medium text-muted-foreground md:grid", GRID)} aria-hidden>
        <span>Item</span>
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <ul className="space-y-3 md:space-y-2" aria-label="Line items">
        {fields.map((f, i) => {
          const line = lines[i];
          const item = line?.itemId ? items.find((x) => x.id === line.itemId) : undefined;
          const available = item && branchId ? (item.stock[branchId] ?? 0) : undefined;
          const short = item && shortfalls.find((s) => s.item.id === item.id);
          const err = errors?.[i];
          const amount = roundMoney((Number.isFinite(line?.quantity) ? line.quantity : 0) * (Number.isFinite(line?.unitPrice) ? line.unitPrice : 0), currency);
          return (
            <li key={f.id} className="rounded-lg border p-3 md:border-0 md:p-0">
              <div className={cn("grid grid-cols-2 items-start gap-2", GRID)}>
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor={`line-${i}-item`} className="mb-1 text-xs text-muted-foreground md:sr-only">Item (line {i + 1})</Label>
                  <Controller
                    control={control}
                    name={`lines.${i}.itemId`}
                    render={({ field }) => (
                      <ItemCombobox
                        id={`line-${i}-item`}
                        items={items}
                        value={field.value}
                        branchId={branchId}
                        currency={currency}
                        rate={rate}
                        onSelect={(it) => {
                          field.onChange(it?.id);
                          if (it) {
                            setValue(`lines.${i}.description`, it.name, { shouldDirty: true, shouldValidate: true });
                            const price = itemPrice(it, currency, rate);
                            if (price !== null) setValue(`lines.${i}.unitPrice`, price, { shouldDirty: true, shouldValidate: true });
                          }
                          setTimeout(() => setFocus(`lines.${i}.quantity`), 0);
                        }}
                      />
                    )}
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Label htmlFor={`line-${i}-desc`} className="mb-1 text-xs text-muted-foreground md:sr-only">Description (line {i + 1})</Label>
                  <Input id={`line-${i}-desc`} placeholder="Description" {...register(`lines.${i}.description`)} aria-invalid={!!err?.description} />
                </div>
                <div>
                  <Label htmlFor={`line-${i}-qty`} className="mb-1 text-xs text-muted-foreground md:sr-only">Quantity (line {i + 1})</Label>
                  <Input
                    id={`line-${i}-qty`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    className="text-right tabular-nums"
                    {...register(`lines.${i}.quantity`, { valueAsNumber: true })}
                    onKeyDown={onEnter(i)}
                    aria-invalid={!!err?.quantity || !!short}
                  />
                </div>
                <div>
                  <Label htmlFor={`line-${i}-price`} className="mb-1 text-xs text-muted-foreground md:sr-only">Unit price (line {i + 1})</Label>
                  <Controller
                    control={control}
                    name={`lines.${i}.unitPrice`}
                    render={({ field }) => (
                      <MoneyInput
                        id={`line-${i}-price`}
                        ref={field.ref}
                        name={field.name}
                        currency={currency}
                        value={Number.isFinite(field.value) ? field.value : ""}
                        onValueChange={(v) => field.onChange(v === "" ? Number.NaN : v)}
                        onBlur={field.onBlur}
                        onKeyDown={onEnter(i)}
                        className="text-right"
                        aria-invalid={!!err?.unitPrice}
                      />
                    )}
                  />
                </div>
                <div className="flex h-9 items-center justify-end text-sm font-medium md:col-span-1">
                  <span className="mr-auto text-xs text-muted-foreground md:hidden">Amount</span>
                  <Money amount={amount} currency={currency} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} disabled={fields.length === 1} aria-label={`Remove line ${i + 1}`}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {(err || available !== undefined) && (
                <div className="mt-1 space-y-0.5 text-xs md:pl-[158px]">
                  {err?.description?.message && <p role="alert" className="text-destructive">{err.description.message}</p>}
                  {err?.quantity?.message && <p role="alert" className="text-destructive">{err.quantity.message}</p>}
                  {err?.unitPrice?.message && <p role="alert" className="text-destructive">{err.unitPrice.message}</p>}
                  {item && available !== undefined && (
                    <p className={cn("flex items-center gap-1", short ? "text-warning-text" : "text-muted-foreground")}>
                      {short ? <AlertTriangle className="size-3" aria-hidden /> : <Info className="size-3" aria-hidden />}
                      {short
                        ? `Only ${available} ${item.unit} available at this branch (${short.requested} requested).`
                        : `${available} ${item.unit} available at this branch.`}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {arrayError && <p role="alert" className="text-xs text-destructive">{arrayError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> Add line
        </Button>
        <p className="text-xs text-muted-foreground">Tip: press Enter in quantity or price to move to the next line.</p>
      </div>

      {noRate && (
        <p className="flex items-start gap-1.5 rounded-lg bg-warning-light px-3 py-2 text-xs text-warning-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Item prices are in USD and no KHR conversion rate is configured, so prices were not converted. Enter riel prices manually.
        </p>
      )}

      {shortfalls.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light px-3 py-2 text-xs text-warning-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Insufficient stock for {shortfalls.length === 1 ? "1 item" : `${shortfalls.length} items`}</p>
            <p>{shortfalls.map((s) => `${s.item.name}: ${s.available} available, ${s.requested} requested`).join("; ")}. {stockHint}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:justify-end">
        <dl className="w-full max-w-sm space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd><Money amount={totals.subtotal} currency={currency} /></dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>
              <Label htmlFor="doc-discount" className="font-normal text-muted-foreground">Discount</Label>
            </dt>
            <dd className="w-40">
              <Controller
                control={control}
                name="discount"
                render={({ field }) => (
                  <MoneyInput
                    id="doc-discount"
                    ref={field.ref}
                    currency={currency}
                    value={Number.isFinite(field.value) ? field.value : ""}
                    onValueChange={(v) => field.onChange(v === "" ? 0 : v)}
                    onBlur={field.onBlur}
                    className="text-right"
                    aria-invalid={!!formState.errors.discount}
                    aria-describedby={formState.errors.discount ? "doc-discount-error" : undefined}
                  />
                )}
              />
            </dd>
          </div>
          {formState.errors.discount?.message && (
            <p id="doc-discount-error" role="alert" className="text-right text-xs text-destructive">{formState.errors.discount.message}</p>
          )}
          {showTax && (
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="taxEnabled"
                  render={({ field }) => <Switch id="doc-vat" checked={!!field.value} onCheckedChange={field.onChange} />}
                />
                <Label htmlFor="doc-vat" className="font-normal text-muted-foreground">VAT {VAT_RATE}%</Label>
              </dt>
              <dd><Money amount={totals.tax} currency={currency} /></dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t pt-2 text-base font-semibold">
            <dt>{totalLabel}</dt>
            <dd><Money amount={totals.total} currency={currency} /></dd>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Amounts in {currency} ({CURRENCY_META[currency].label}){currency === "KHR" ? " · whole riel" : ""}.
          </p>
        </dl>
      </div>
    </div>
  );
}
