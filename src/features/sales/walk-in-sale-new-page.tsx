"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, Loader2, Minus, PackageX, Plus, Search, ShoppingCart, Store, Trash2, UserRound, X } from "lucide-react";
import type { Currency, ID, Item, PaymentMethod, Sale } from "@/types";
import { uid, useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useAction } from "@/hooks/use-action";
import { saleService } from "@/lib/api";
import { documentTotals, stockLevel } from "@/lib/domain";
import { formatMoney, formatNumber } from "@/lib/currency";
import { formatDate, today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UnsavedChangesGuard } from "@/components/shared/unsaved-changes";
import { Field, fieldDescribedBy } from "@/components/forms/field";
import { AccountSelect, BranchSelect, CustomerSelect } from "@/components/forms/entity-selects";
import { MoneyInput } from "@/components/forms/money-input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useItemCategories } from "@/features/inventory/inventory-shared";
import { PAYMENT_META, defaultAccountFor } from "./sales-shared";
import { SaleReceipt } from "./sale-receipt";

const POS_METHODS = ["cash", "khqr", "aba_pay", "wing"] as const satisfies readonly PaymentMethod[];

const checkoutSchema = z.object({
  customerId: z.string().optional(),
  discount: z.union([z.number(), z.literal("")]),
  paymentMethod: z.enum(["cash", "khqr", "aba_pay", "wing"]),
  accountId: z.string().min(1, "Choose the account that receives this payment"),
});
type Checkout = z.infer<typeof checkoutSchema>;

export function WalkInSaleNewPage() {
  const { branch, branches, isOwner, user } = useScope();
  const initialBranch = branch?.id ?? (!isOwner ? user.branchId : branches.length === 1 ? branches[0].id : undefined) ?? "";
  const [branchId, setBranchId] = useState<ID>(initialBranch);
  const [pendingBranch, setPendingBranch] = useState<ID | null>(null);
  const [cart, setCart] = useState<Record<ID, number>>({});
  const [completed, setCompleted] = useState<Sale | null>(null);
  const [session, setSession] = useState(0);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  if (completed) {
    return (
      <SaleSuccess
        sale={completed}
        onNew={() => {
          setCompleted(null);
          setCart({});
          setSession((s) => s + 1);
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        backHref="/walk-in-sales"
        backLabel="Walk-in sales"
        title="New walk-in sale"
        description={`Counter sale dated ${formatDate(today())}. Completing the sale posts income to the chosen account and deducts stock.`}
        actions={
          <div className="flex w-full items-center gap-2 sm:w-72">
            <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <label htmlFor="pos-branch" className="sr-only">
              Branch
            </label>
            <BranchSelect
              id="pos-branch"
              value={branchId || undefined}
              placeholder="Choose a branch to sell from"
              onChange={(v) => {
                if (v === branchId) return;
                if (cartCount > 0) setPendingBranch(v);
                else setBranchId(v);
              }}
            />
          </div>
        }
      />
      {!branchId ? (
        <Card>
          <EmptyState
            icon={Store}
            title="Which branch is making this sale?"
            description="Stock and the receiving accounts depend on the branch. You can change it later with the branch selector above."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {branches
                  .filter((b) => b.status === "active")
                  .map((b) => (
                    <Button key={b.id} variant="outline" onClick={() => setBranchId(b.id)}>
                      {b.name}
                    </Button>
                  ))}
              </div>
            }
          />
        </Card>
      ) : (
        <PosBody key={`${branchId}-${session}`} branchId={branchId} cart={cart} setCart={setCart} onCompleted={setCompleted} />
      )}
      <ConfirmDialog
        open={pendingBranch !== null}
        onOpenChange={(o) => !o && setPendingBranch(null)}
        title="Switch branch and clear the cart?"
        description="Stock is tracked per branch, so the items in the cart will be removed."
        confirmLabel="Switch branch"
        destructive
        onConfirm={() => {
          setCart({});
          setBranchId(pendingBranch!);
          setPendingBranch(null);
        }}
      />
    </>
  );
}

function PosBody({ branchId, cart, setCart, onCompleted }: { branchId: ID; cart: Record<ID, number>; setCart: React.Dispatch<React.SetStateAction<Record<ID, number>>>; onCompleted: (s: Sale) => void }) {
  const items = useAppStore((s) => s.items);
  const accounts = useAppStore((s) => s.accounts);
  const cats = useItemCategories();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [done, setDone] = useState(false);

  const sellable = useMemo(() => items.filter((i) => i.status === "active").sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sellable.filter((i) => (category === "all" || i.categoryId === category) && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.nameKm ?? "").includes(q) || (i.barcode ?? "") === q));
  }, [sellable, query, category]);

  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty }))
    .filter((l) => l.item);
  const currency: Currency = cartLines[0]?.item.currency ?? "USD";
  const lineItems = cartLines.map((l) => ({ id: l.item.id, itemId: l.item.id, description: l.item.name, quantity: l.qty, unitPrice: l.item.sellingPrice }));
  const subtotal = documentTotals(lineItems, 0, 0, currency).subtotal;

  const form = useForm<Checkout>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { customerId: undefined, discount: "", paymentMethod: "cash", accountId: defaultAccountFor("cash", accounts, branchId, currency)?.id ?? "" },
  });
  const { control, handleSubmit, setValue, setError, clearErrors, formState } = form;
  const [method, discountRaw, customerId] = useWatch({ control, name: ["paymentMethod", "discount", "customerId"] });
  const discount = typeof discountRaw === "number" ? discountRaw : 0;
  const discountError = discount < 0 ? "Discount can't be negative" : discount > subtotal ? "Discount can't exceed the subtotal" : undefined;
  const total = documentTotals(lineItems, Math.max(0, Math.min(discount, subtotal)), 0, currency).total;

  // Pick the receiving account that matches the payment method and cart currency.
  useEffect(() => {
    setValue("accountId", defaultAccountFor(method, accounts, branchId, currency)?.id ?? "", { shouldValidate: formState.isSubmitted });
  }, [method, currency, branchId, accounts, setValue, formState.isSubmitted]);

  const stockOf = (i: Item) => i.stock[branchId] ?? 0;
  const add = (i: Item) => setCart((c) => ({ ...c, [i.id]: Math.min(stockOf(i), (c[i.id] ?? 0) + 1) }));
  const setQty = (i: Item, q: number) =>
    setCart((c) => {
      const n = { ...c };
      const v = Math.max(0, Math.min(stockOf(i), Math.floor(q || 0)));
      if (v === 0) delete n[i.id];
      else n[i.id] = v;
      return n;
    });

  const complete = useAction(
    (v: Checkout) =>
      saleService.create({
        date: today(),
        branchId,
        channel: "walk_in",
        customerId: v.customerId || undefined,
        lines: lineItems.map((l) => ({ ...l, id: uid("ln") })),
        currency,
        discount,
        paymentMethod: v.paymentMethod,
        accountId: v.accountId,
      }),
    {
      success: (s) => `Sale ${s.number} completed — ${formatMoney(total, currency)}`,
      onSuccess: (s) => {
        setDone(true);
        onCompleted(s);
      },
    },
  );

  const onSubmit = handleSubmit((v) => {
    if (discountError) {
      setError("discount", { message: discountError });
      return;
    }
    if (!cartLines.length) return;
    complete.fire(v);
  });

  const noAccount = !defaultAccountFor(method, accounts, branchId, currency);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <UnsavedChangesGuard when={cartLines.length > 0 && !done} message="The cart hasn't been checked out. Leave and discard this sale?" />
      {/* Catalog */}
      <section aria-label="Item catalog" className="min-w-0">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, SKU or scan a barcode…" className="h-10 pl-9" aria-label="Search items" autoFocus />
          {query && (
            <Button variant="ghost" size="icon-sm" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setQuery("")} aria-label="Clear search">
              <X />
            </Button>
          )}
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
          {[{ id: "all", name: "All items" }, ...cats].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                category === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <Card>
            <EmptyState compact icon={Search} title="No items match" description="Try another search or category." />
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((i) => {
              const stock = stockOf(i);
              const inCart = cart[i.id] ?? 0;
              const level = stockLevel(stock, i.reorderLevel);
              const wrongCurrency = cartLines.length > 0 && i.currency !== currency;
              const disabled = stock <= 0 || inCart >= stock || wrongCurrency;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => add(i)}
                    disabled={disabled}
                    aria-label={`Add ${i.name}, ${formatMoney(i.sellingPrice, i.currency)}, ${stock} in stock${inCart ? `, ${inCart} in cart` : ""}`}
                    className={cn(
                      "relative flex h-full w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors outline-none hover:border-primary/50 hover:bg-primary-light/20 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card",
                      inCart > 0 && "border-primary ring-1 ring-primary",
                    )}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums" aria-hidden>
                        {inCart}
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted-foreground">{i.sku}</span>
                    <span className="line-clamp-2 pr-5 text-sm leading-snug font-medium">{i.name}</span>
                    <span className="mt-auto flex flex-wrap items-end justify-between gap-1">
                      <span className="text-base font-semibold tabular-nums">{formatMoney(i.sellingPrice, i.currency)}</span>
                      <span className="text-xs text-muted-foreground">/{i.unit}</span>
                    </span>
                    <span className="flex items-center justify-between gap-1 text-xs">
                      {level === "ok" ? (
                        <span className="text-muted-foreground tabular-nums">{formatNumber(stock)} in stock</span>
                      ) : (
                        <StatusBadge status={level} label={level === "out" ? "Out of stock" : `Low · ${formatNumber(stock)} left`} />
                      )}
                    </span>
                    {wrongCurrency && <span className="text-[11px] text-muted-foreground">Priced in {i.currency} — sell on a separate receipt</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cart */}
      <aside aria-label="Cart" className="lg:sticky lg:top-20 lg:self-start">
        <Card className="gap-0 py-0">
          <form onSubmit={onSubmit} noValidate>
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="size-4" aria-hidden /> Cart
                <span className="text-muted-foreground tabular-nums">({cartLines.reduce((a, l) => a + l.qty, 0)})</span>
              </h2>
              {cartLines.length > 0 && (
                <Button type="button" variant="ghost" size="xs" onClick={() => setCart({})}>
                  <Trash2 /> Clear
                </Button>
              )}
            </div>
            {cartLines.length === 0 ? (
              <EmptyState compact icon={ShoppingCart} title="Cart is empty" description="Tap an item to add it." />
            ) : (
              <ul className="max-h-[40vh] divide-y overflow-y-auto" aria-live="polite">
                {cartLines.map(({ item: i, qty }) => {
                  const stock = stockOf(i);
                  return (
                    <li key={i.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{i.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(i.sellingPrice, i.currency)} × {qty} · {formatNumber(stock)} available
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(i.sellingPrice * qty, i.currency)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setQty(i, qty - 1)} aria-label={`Decrease ${i.name}`}>
                          <Minus />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={stock}
                          value={qty}
                          onChange={(e) => setQty(i, Number(e.target.value))}
                          className="h-8 w-16 text-center tabular-nums"
                          aria-label={`Quantity of ${i.name}`}
                        />
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setQty(i, qty + 1)} disabled={qty >= stock} aria-label={`Increase ${i.name}`}>
                          <Plus />
                        </Button>
                        {qty >= stock && <span className="ml-1 text-[11px] text-warning-text">Max stock</span>}
                        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setQty(i, 0)} aria-label={`Remove ${i.name}`}>
                          <X />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-4 border-t px-5 py-4">
              <Field label="Customer" htmlFor="pos-customer" helper={customerId ? undefined : "Optional — leave empty for an anonymous walk-in."}>
                <div className="flex items-center gap-1">
                  <Controller control={control} name="customerId" render={({ field }) => <CustomerSelect id="pos-customer" type="walk_in" value={field.value} onChange={field.onChange} placeholder="Walk-in customer (anonymous)" />} />
                  {customerId && (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setValue("customerId", undefined)} aria-label="Remove customer">
                      <X />
                    </Button>
                  )}
                </div>
              </Field>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">Payment method</legend>
                <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Payment method">
                  {POS_METHODS.map((m) => {
                    const meta = PAYMENT_META[m];
                    const Icon = meta.icon;
                    const on = method === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setValue("paymentMethod", m);
                          clearErrors("accountId");
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          on ? "border-primary bg-primary-light/50 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <Field
                label="Deposit to"
                htmlFor="pos-account"
                required
                error={formState.errors.accountId?.message}
                helper={noAccount ? `No ${method === "cash" ? "cash drawer" : "bank or e-wallet"} account in ${currency} at this branch — pick another account or method.` : method === "cash" ? "Branch cash drawer" : "Branch bank / e-wallet account"}
              >
                <Controller
                  control={control}
                  name="accountId"
                  render={({ field }) => <AccountSelect id="pos-account" branchId={branchId} currency={currency} value={field.value || undefined} onChange={field.onChange} aria-invalid={!!formState.errors.accountId} />}
                />
              </Field>

              <Field label="Discount" htmlFor="pos-discount" error={formState.errors.discount?.message ?? (discountRaw !== "" ? discountError : undefined)}>
                <Controller
                  control={control}
                  name="discount"
                  render={({ field }) => (
                    <MoneyInput
                      id="pos-discount"
                      currency={currency}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        clearErrors("discount");
                      }}
                      placeholder="0.00"
                      aria-invalid={!!discountError}
                      aria-describedby={fieldDescribedBy("pos-discount", !!discountError)}
                    />
                  )}
                />
              </Field>

              <Separator />
              <dl className="space-y-1 text-sm tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatMoney(subtotal, currency)}</dd>
                </div>
                {discount > 0 && !discountError && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd>−{formatMoney(discount, currency)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-2xl font-semibold">{formatMoney(total, currency)}</dd>
                </div>
              </dl>
              <Button type="submit" size="lg" className="w-full" disabled={cartLines.length === 0 || complete.pending || !!discountError}>
                {complete.pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {complete.pending ? "Completing sale…" : cartLines.length ? `Complete sale · ${formatMoney(total, currency)}` : "Complete sale"}
              </Button>
            </div>
          </form>
        </Card>
      </aside>
    </div>
  );
}

function SaleSuccess({ sale, onNew }: { sale: Sale; onNew: () => void }) {
  const items = useAppStore((s) => s.items);
  const lows = sale.lines
    .map((l) => items.find((i) => i.id === l.itemId))
    .filter((i): i is Item => !!i)
    .map((i) => ({ item: i, qty: i.stock[sale.branchId] ?? 0 }))
    .filter((x) => x.qty <= x.item.reorderLevel);
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-2 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-light text-success-text">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Sale completed</h1>
        <p className="text-sm text-muted-foreground">Income was posted and stock was deducted at the branch.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={onNew} autoFocus>
            <Plus /> New sale
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/walk-in-sales/${sale.id}`}>View sale</Link>
          </Button>
        </div>
      </div>
      {lows.length > 0 && (
        <div className="mx-auto mb-6 max-w-md rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning-text">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Reorder soon
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {lows.map(({ item, qty }) => (
              <li key={item.id} className="flex items-center gap-1.5">
                {qty <= 0 ? <PackageX className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                <Link href={`/items/${item.id}`} className="underline-offset-2 hover:underline">
                  {item.name}
                </Link>
                — {qty <= 0 ? "out of stock" : `${qty} ${item.unit} left`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SaleReceipt sale={sale} />
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="size-3.5" aria-hidden /> Served by {sale.createdBy}
      </p>
    </>
  );
}
