"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";
import { plannedPurchaseService } from "@/lib/api";
import { today } from "@/lib/date";
import { PageHeader } from "@/components/shared/page-header";
import { PlannedPurchaseForm, plannedPurchaseDefaults, toPlannedPurchasePayload, type PlannedPurchaseFormValues } from "./planned-purchase-form";
import { sendNote, type SendChannel } from "./send-dialog";

export function PlannedPurchaseNewPage({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const customers = useAppStore((s) => s.customers);
  const { branch, branches, inScope } = useScope();

  const defaults = useMemo(() => {
    const c = customers.find((x) => x.id === customerId && x.type === "wholesale" && inScope(x.branchId));
    return plannedPurchaseDefaults({ customerId: c?.id, branchId: c?.branchId ?? branch?.id ?? (branches.length === 1 ? branches[0].id : undefined) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const submit = async (v: PlannedPurchaseFormValues, send?: SendChannel) => {
    try {
      const pp = await plannedPurchaseService.create({ ...toPlannedPurchasePayload(v), createdDate: today() });
      if (send) await plannedPurchaseService.setStatus(pp.id, "sent", sendNote(send, customers.find((c) => c.id === v.customerId)));
      toast.success(send ? `${pp.number} sent to customer (simulated)` : `${pp.number} saved as draft`);
      router.push(`/planned-purchases/${pp.id}`);
    } catch (e) {
      toast.error("Couldn't save planned purchase", { description: e instanceof Error ? e.message : undefined });
      throw e;
    }
  };

  return (
    <>
      <PageHeader
        backHref="/planned-purchases"
        backLabel="Planned purchases"
        title="New planned purchase"
        description="Prepare an estimate for a wholesale customer. Once they accept, convert it into an invoice in one step."
      />
      <PlannedPurchaseForm defaultValues={defaults} onSubmit={submit} onCancel={() => router.push(customerId ? `/customers/${customerId}` : "/planned-purchases")} />
    </>
  );
}
