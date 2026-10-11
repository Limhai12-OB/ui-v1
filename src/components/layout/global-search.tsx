"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Package, Receipt, Users, ArrowLeftRight } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NAV_GROUPS } from "@/lib/navigation";
import { can } from "@/lib/permissions";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useT } from "@/hooks/use-t";
import { formatMoney } from "@/lib/currency";
import { invoiceTotals } from "@/lib/domain";

/** ⌘K command palette: pages plus records in the user's scope. */
export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const t = useT();
  const { user, inScope } = useScope();
  const [q, setQ] = useState("");
  const invoices = useAppStore((s) => s.invoices);
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  const bills = useAppStore((s) => s.bills);
  const transactions = useAppStore((s) => s.transactions);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length < 2) return null;
    const m = (s?: string) => !!s && s.toLowerCase().includes(query);
    return {
      invoices: invoices.filter((i) => inScope(i.branchId) && (m(i.number) || m(customers.find((c) => c.id === i.customerId)?.name))).slice(0, 5),
      customers: customers.filter((c) => (user.role === "owner" || inScope(c.branchId)) && (m(c.name) || m(c.phone))).slice(0, 5),
      items: items.filter((i) => m(i.name) || m(i.sku)).slice(0, 5),
      bills: bills.filter((b) => inScope(b.branchId) && (m(b.number) || m(b.supplier))).slice(0, 5),
      transactions: transactions.filter((tx) => inScope(tx.branchId) && (m(tx.description) || m(tx.reference) || m(tx.counterparty))).slice(-5).reverse(),
    };
  }, [query, invoices, customers, items, bills, transactions, inScope, user.role]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  const pages = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.permission || can(user.role, i.permission));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search pages and records">
      <CommandInput placeholder={t("header.search")} value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results for “{q}”.</CommandEmpty>
        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem key={p.href} value={`page ${t(p.labelKey)}`} onSelect={() => go(p.href)}>
              <p.icon /> {t(p.labelKey)}
            </CommandItem>
          ))}
        </CommandGroup>
        {results && (
          <>
            {results.invoices.length > 0 && (
              <CommandGroup heading="Invoices">
                {results.invoices.map((i) => (
                  <CommandItem key={i.id} value={`inv ${i.number} ${i.id}`} onSelect={() => go(`/invoices/${i.id}`)}>
                    <FileText /> {i.number}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatMoney(invoiceTotals(i).total, i.currency)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.customers.length > 0 && (
              <CommandGroup heading="Customers">
                {results.customers.map((c) => (
                  <CommandItem key={c.id} value={`cus ${c.name} ${c.id}`} onSelect={() => go(`/customers/${c.id}`)}>
                    <Users /> {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.items.length > 0 && (
              <CommandGroup heading="Items">
                {results.items.map((i) => (
                  <CommandItem key={i.id} value={`itm ${i.name} ${i.sku}`} onSelect={() => go(`/items/${i.id}`)}>
                    <Package /> {i.name} <span className="ml-auto text-xs text-muted-foreground">{i.sku}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.bills.length > 0 && (
              <CommandGroup heading="Bills">
                {results.bills.map((b) => (
                  <CommandItem key={b.id} value={`bill ${b.number} ${b.supplier}`} onSelect={() => go(`/bills/${b.id}`)}>
                    <Receipt /> {b.number} · {b.supplier}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {results.transactions.length > 0 && (
              <CommandGroup heading="Transactions">
                {results.transactions.map((tx) => (
                  <CommandItem key={tx.id} value={`tx ${tx.id} ${tx.description}`} onSelect={() => go(`/transactions/${tx.id}`)}>
                    <ArrowLeftRight /> <span className="truncate">{tx.description}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatMoney(tx.amount, tx.currency)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
