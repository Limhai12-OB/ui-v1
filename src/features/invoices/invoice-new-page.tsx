"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mic } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { invoiceService } from "@/lib/api";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceForm, invoiceDefaults, toNewInvoice, type InvoiceFormValues } from "./invoice-form";

export function InvoiceNewPage({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const customers = useAppStore((s) => s.customers);
  const { branch, branches, inScope } = useScope();

  const defaults = useMemo(() => {
    const c = customers.find((x) => x.id === customerId && x.type === "wholesale" && inScope(x.branchId));
    const fallbackBranch = branch?.id ?? (branches.length === 1 ? branches[0].id : undefined);
    return invoiceDefaults({ customerId: c?.id, branchId: c?.branchId ?? fallbackBranch, terms: c?.paymentTermsDays });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const submit = async (v: InvoiceFormValues, send: boolean) => {
    try {
      const inv = await invoiceService.create(toNewInvoice(v, { send, source: "manual" }));
      toast.success(send ? `${inv.number} created and sent` : `${inv.number} saved as draft`, send ? { description: "Stock for item lines was deducted from the branch." } : undefined);
      router.push(`/invoices/${inv.id}`);
    } catch (e) {
      toast.error("Couldn't create invoice", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  return (
    <>
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        title="New invoice"
        description="Bill a wholesale customer. Save as a draft to finish later, or send it now."
        actions={
          <Button variant="outline" asChild>
            <Link href="/invoices/voice">
              <Mic /> Use Voice-to-Invoice
            </Link>
          </Button>
        }
      />
      <InvoiceForm defaultValues={defaults} onSubmit={submit} onCancel={() => router.push(customerId ? `/customers/${customerId}` : "/invoices")} />
    </>
  );
}
