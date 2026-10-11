import type { Metadata } from "next";
import { BranchFormPage } from "@/features/branches/branch-form-page";

export const metadata: Metadata = { title: "New branch" };

export default function Page() {
  return <BranchFormPage />;
}
