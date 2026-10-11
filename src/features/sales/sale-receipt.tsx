"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { Sale } from "@/types";
import { useAppStore } from "@/store/app-store";
import { useLookups } from "@/hooks/use-lookup";
import { documentTotals } from "@/lib/domain";
import { formatMoney, formatNumber } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { Separator } from "@/components/ui/separator";
import { PAYMENT_META } from "./sales-shared";

/** Receipt-style rendering of a sale (lines, totals, payment). */
export function SaleReceipt({ sale }: { sale: Sale }) {
  const businessName = useAppStore((s) => s.business.name);
  const { branch, customer, item, accountName } = useLookups();
  const b = branch(sale.branchId);
  const totals = documentTotals(sale.lines, sale.discount, 0, sale.currency);
  const units = sale.lines.reduce((a, l) => a + l.quantity, 0);
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 font-mono text-[13px] shadow-xs">
      <div className="text-center">
        <p className="font-sans text-base font-semibold">{businessName}</p>
        <p className="text-xs text-muted-foreground">{b?.name}</p>
        {b && <p className="text-xs text-muted-foreground">{b.address}, {b.city} · {b.phone}</p>}
      </div>
      <Separator className="my-4 border-dashed" />
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Receipt</dt>
        <dd className="text-right">{sale.number}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd className="text-right">
          {formatDate(sale.date)} {format(parseISO(sale.createdAt), "HH:mm")}
        </dd>
        <dt className="text-muted-foreground">Customer</dt>
        <dd className="text-right">
          {sale.customerId ? (
            <Link href={`/customers/${sale.customerId}`} className="underline-offset-2 hover:underline">
              {customer(sale.customerId)?.name ?? "Customer"}
            </Link>
          ) : (
            "Walk-in customer"
          )}
        </dd>
        <dt className="text-muted-foreground">Cashier</dt>
        <dd className="text-right">{sale.createdBy}</dd>
      </dl>
      <Separator className="my-4" />
      <table className="w-full">
        <caption className="sr-only">Items sold</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="pb-1 font-normal">Item</th>
            <th scope="col" className="pb-1 text-right font-normal">Qty</th>
            <th scope="col" className="pb-1 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l) => {
            const it = item(l.itemId);
            return (
              <tr key={l.id} className="align-top">
                <td className="py-1 pr-2">
                  {it ? (
                    <Link href={`/items/${it.id}`} className="font-sans hover:underline">
                      {it.name}
                    </Link>
                  ) : (
                    <span className="font-sans">{l.description}</span>
                  )}
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatNumber(l.quantity)} × {formatMoney(l.unitPrice, sale.currency)}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{formatNumber(l.quantity)}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(l.quantity * l.unitPrice, sale.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Separator className="my-4" />
      <dl className="grid grid-cols-2 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Subtotal ({formatNumber(units)} items)</dt>
        <dd className="text-right">{formatMoney(totals.subtotal, sale.currency)}</dd>
        {sale.discount > 0 && (
          <>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="text-right">−{formatMoney(sale.discount, sale.currency)}</dd>
          </>
        )}
        <dt className="pt-2 font-sans text-base font-semibold">Total</dt>
        <dd className="pt-2 text-right font-sans text-base font-semibold">{formatMoney(totals.total, sale.currency)}</dd>
        <dt className="text-muted-foreground">Paid by</dt>
        <dd className="text-right">{PAYMENT_META[sale.paymentMethod].label}</dd>
        <dt className="text-muted-foreground">Into</dt>
        <dd className="text-right">{accountName(sale.accountId)}</dd>
      </dl>
      <Separator className="my-4 border-dashed" />
      <p className="text-center text-xs text-muted-foreground">Thank you · សូមអរគុណ</p>
    </div>
  );
}
