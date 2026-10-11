"use client";

import { useMemo } from "react";
import type { CategoryKind, Currency, ID } from "@/types";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import { useScope } from "@/hooks/use-scope";

interface BaseSelectProps {
  id?: string;
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}

/** Branch picker limited to the branches the current user can access. */
export function BranchSelect({ id, value, onChange, placeholder = "Select branch", disabled, className, ...rest }: BaseSelectProps) {
  const { branches, isOwner } = useScope();
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || (!isOwner && branches.length === 1)}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-invalid={rest["aria-invalid"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {branches.filter((b) => b.status === "active").map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Financial account picker, optionally filtered by branch and currency. */
export function AccountSelect({ id, value, onChange, placeholder = "Select account", disabled, className, branchId, currency, excludeId, ...rest }: BaseSelectProps & { branchId?: ID; currency?: Currency; excludeId?: ID }) {
  const accounts = useAppStore((s) => s.accounts);
  const { inScope } = useScope();
  const list = useMemo(
    () => accounts.filter((a) => a.status === "active" && inScope(a.branchId) && (!branchId || a.branchId === branchId) && (!currency || a.currency === currency) && a.id !== excludeId),
    [accounts, inScope, branchId, currency, excludeId],
  );
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-invalid={rest["aria-invalid"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No matching accounts</div>}
        {list.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name} <span className="text-muted-foreground">· {a.currency}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CategorySelect({ id, value, onChange, placeholder = "Select category", disabled, className, kind, ...rest }: BaseSelectProps & { kind?: CategoryKind | CategoryKind[] }) {
  const categories = useAppStore((s) => s.categories);
  const kinds = kind ? (Array.isArray(kind) ? kind : [kind]) : (["income", "expense"] as CategoryKind[]);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-invalid={rest["aria-invalid"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {kinds.map((k) => (
          <SelectGroup key={k}>
            {kinds.length > 1 && <SelectLabel className="capitalize">{k}</SelectLabel>}
            {categories.filter((c) => c.kind === k).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CustomerSelect({ id, value, onChange, placeholder = "Select customer", disabled, className, type, ...rest }: BaseSelectProps & { type?: "wholesale" | "walk_in" }) {
  const customers = useAppStore((s) => s.customers);
  const { inScope, isOwner } = useScope();
  const list = customers.filter((c) => (!type || c.type === type) && (isOwner || inScope(c.branchId)));
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-invalid={rest["aria-invalid"]}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CurrencySelect({ id, value, onChange, disabled, className }: BaseSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="USD">USD – US Dollar</SelectItem>
        <SelectItem value="KHR">KHR – Cambodian Riel</SelectItem>
      </SelectContent>
    </Select>
  );
}
