"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRightLeft, Plus, ReceiptText } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { useLookups } from "@/hooks/use-lookup";
import { formatNumber } from "@/lib/currency";
import { formatDateTime } from "@/lib/date";
import { stockLevel } from "@/lib/domain";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailList } from "@/components/shared/detail-list";
import { Money } from "@/components/shared/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SignedQty } from "@/features/inventory/inventory-shared";
import { CHANNEL_LABEL, PaymentMethodLabel, saleTotal } from "./sales-shared";
import { SaleReceipt } from "./sale-receipt";

export function WalkInSaleDetailPage({ id }: { id: string }) {
  const sale = useAppStore((s) => s.sales.find((x) => x.id === id));
  const transactions = useAppStore((s) => s.transactions);
  const movements = useAppStore((s) => s.stockMovements);
  const { inScope } = useScope();
  const { branchName, account, item } = useLookups();

  const saleMovements = useMemo(() => (sale ? movements.filter((m) => m.type === "sale" && m.reference === sale.number && m.branchId === sale.branchId) : []), [movements, sale]);

  if (!sale || !inScope(sale.branchId)) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Sale not found"
        description="It may belong to a branch you can't access, or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/walk-in-sales">Back to walk-in sales</Link>
          </Button>
        }
      />
    );
  }

  const tx = transactions.find((t) => t.id === sale.transactionId);
  const acc = account(sale.accountId);

  return (
    <>
      <PageHeader
        backHref="/walk-in-sales"
        backLabel="Walk-in sales"
        title={sale.number}
        meta={<Badge variant="outline">{CHANNEL_LABEL[sale.channel]}</Badge>}
        description={`${branchName(sale.branchId)} · recorded ${formatDateTime(sale.createdAt)} by ${sale.createdBy}`}
        actions={
          <Button asChild>
            <Link href="/walk-in-sales/new">
              <Plus /> New sale
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <SaleReceipt sale={sale} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                columns={1}
                items={[
                  { label: "Total received", value: <Money amount={saleTotal(sale)} currency={sale.currency} className="text-base font-semibold" /> },
                  { label: "Method", value: <PaymentMethodLabel method={sale.paymentMethod} /> },
                  { label: "Deposited to", value: acc ? <Link href={`/accounts/${acc.id}`} className="underline-offset-2 hover:underline">{acc.name}</Link> : "—" },
                  {
                    label: "Ledger transaction",
                    value: tx ? (
                      <Link href={`/transactions/${tx.id}`} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
                        <ArrowRightLeft className="size-3.5" aria-hidden /> Income · {tx.description}
                        <StatusBadge status={tx.status} className="ml-1" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Stock movements</CardTitle>
              <CardDescription>Created by this sale at {branchName(sale.branchId)}.</CardDescription>
            </CardHeader>
            {saleMovements.length === 0 ? (
              <EmptyState compact title="No stock movements recorded" />
            ) : (
              <ul className="divide-y">
                {saleMovements.map((m) => {
                  const it = item(m.itemId);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <Link href={`/items/${m.itemId}`} className="block truncate font-medium hover:underline">
                          {it?.name ?? "Item"}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatNumber(m.resultingQuantity)} {it?.unit} left
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SignedQty value={m.quantityChange} />
                        {it && <StatusBadge status={stockLevel(m.resultingQuantity, it.reorderLevel)} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
