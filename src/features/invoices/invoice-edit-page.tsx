"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { invoiceService } from "@/lib/api";
import { invoiceStatus } from "@/lib/domain";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { fromLineItems } from "@/features/sales-shared/lines";
import { InvoiceForm, toNewInvoice, type InvoiceFormValues } from "./invoice-form";

export function InvoiceEditPage({ id }: { id: string }) {
  const router = useRouter();
  const invoice = useAppStore((s) => s.invoices.find((i) => i.id === id));
  const { inScope } = useScope();
  const [submitted, setSubmitted] = useState(false);

  const defaults = useMemo<InvoiceFormValues | null>(
    () =>
      invoice
        ? {
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            currency: invoice.currency,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            lines: fromLineItems(invoice.lines),
            discount: invoice.discount,
            taxEnabled: invoice.taxRate > 0,
            notes: invoice.notes ?? "",
          }
        : null,
    // Snapshot once: don't reset the form while the user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoice?.id],
  );

  if (!invoice || !inScope(invoice.branchId) || !defaults) {
    return (
      <EmptyState
        title="Invoice not found"
        description="This invoice doesn't exist or belongs to a branch you can't access."
        action={
          <Button asChild>
            <Link href="/invoices">Back to invoices</Link>
          </Button>
        }
      />
    );
  }

  if (invoice.baseStatus !== "draft" && !submitted) {
    const status = invoiceStatus(invoice);
    return (
      <EmptyState
        icon={Lock}
        title={`${invoice.number} can't be edited`}
        description={
          <>
            Only draft invoices can be edited. This invoice is <StatusBadge status={status} className="align-middle" />
            {status === "cancelled" ? "." : " — it has been sent to the customer and may already have stock movements and payments. Cancel it (if unpaid) and create a new one instead."}
          </>
        }
        action={
          <Button asChild>
            <Link href={`/invoices/${invoice.id}`}>View invoice</Link>
          </Button>
        }
      />
    );
  }

  const submit = async (v: InvoiceFormValues, send: boolean) => {
    try {
      setSubmitted(true);
      await invoiceService.updateDraft(invoice.id, { ...toNewInvoice(v), send });
      toast.success(send ? `${invoice.number} saved and sent` : `${invoice.number} saved`);
      router.push(`/invoices/${invoice.id}`);
    } catch (e) {
      setSubmitted(false);
      toast.error("Couldn't save invoice", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  return (
    <>
      <PageHeader backHref={`/invoices/${invoice.id}`} backLabel={invoice.number} title={`Edit ${invoice.number}`} meta={<StatusBadge status="draft" />} description="Drafts can be changed freely until they're sent." />
      <InvoiceForm defaultValues={defaults} onSubmit={submit} onCancel={() => router.push(`/invoices/${invoice.id}`)} sendLabel="Save & send" />
    </>
  );
}
