"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { CustomerForm } from "./customer-form";

export function CustomerNewPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="New customer" description="Add a wholesale account or a walk-in regular. You can invoice wholesale customers straight away." backHref="/customers" backLabel="Customers" />
      <Card className="max-w-4xl px-6 py-2">
        <CustomerForm onSaved={(c) => router.push(`/customers/${c.id}`)} onCancel={() => router.push("/customers")} />
      </Card>
    </>
  );
}
