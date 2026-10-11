"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/app-store";
import type { ID } from "@/types";

/** Memoized id -> name lookups for common entities. */
export function useLookups() {
  const branches = useAppStore((s) => s.branches);
  const accounts = useAppStore((s) => s.accounts);
  const categories = useAppStore((s) => s.categories);
  const customers = useAppStore((s) => s.customers);
  const items = useAppStore((s) => s.items);
  return useMemo(() => {
    const m = <T extends { id: ID }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
    const b = m(branches);
    const a = m(accounts);
    const c = m(categories);
    const cu = m(customers);
    const i = m(items);
    return {
      branch: (id?: ID) => (id ? b.get(id) : undefined),
      account: (id?: ID) => (id ? a.get(id) : undefined),
      category: (id?: ID) => (id ? c.get(id) : undefined),
      customer: (id?: ID) => (id ? cu.get(id) : undefined),
      item: (id?: ID) => (id ? i.get(id) : undefined),
      branchName: (id?: ID) => (id ? (b.get(id)?.name ?? "—") : "—"),
      accountName: (id?: ID) => (id ? (a.get(id)?.name ?? "—") : "—"),
      categoryName: (id?: ID) => (id ? (c.get(id)?.name ?? "Uncategorized") : "Uncategorized"),
      customerName: (id?: ID) => (id ? (cu.get(id)?.name ?? "—") : "Walk-in customer"),
      itemName: (id?: ID) => (id ? (i.get(id)?.name ?? "—") : "—"),
    };
  }, [branches, accounts, categories, customers, items]);
}
