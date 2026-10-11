import type { Metadata } from "next";
import { BranchFormPage } from "@/features/branches/branch-form-page";

export const metadata: Metadata = { title: "Edit branch" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BranchFormPage id={id} />;
}
