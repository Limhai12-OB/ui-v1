"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app-store";
import { useSessionStore } from "@/store/session-store";
import { useUIStore } from "@/store/ui-store";
import { can, type Permission } from "@/lib/permissions";
import type { Branch, ID, User } from "@/types";
import type { MoneyContext, Scope } from "@/lib/analytics";

export function useCurrentUser(): User {
  const userId = useSessionStore((s) => s.userId);
  const users = useAppStore((s) => s.users);
  return users.find((u) => u.id === userId) ?? users[0];
}

export function useCan(permission: Permission): boolean {
  const user = useCurrentUser();
  return can(user?.role, permission);
}

export interface ScopeInfo {
  user: User;
  isOwner: boolean;
  /** "all" only for owners viewing the consolidated business. */
  branchId: ID | "all";
  /** Branches the user may see (owner: all; manager: assigned). */
  branches: Branch[];
  /** Branch ids currently in scope given the branch selector. */
  scope: Scope;
  /** The single branch in scope, if any. */
  branch?: Branch;
  inScope: (branchId: ID | undefined) => boolean;
  money: MoneyContext;
}

/**
 * Current data scope: who is signed in, which branches they can see, the
 * selected branch filter and the display currency/rate. Every list and
 * analytic should filter through `scope` / `inScope`.
 */
export function useScope(): ScopeInfo {
  const user = useCurrentUser();
  const allBranches = useAppStore((s) => s.branches);
  const rate = useAppStore((s) => s.business.khrPerUsd);
  const { selectedBranchId, displayCurrency } = useUIStore(useShallow((s) => ({ selectedBranchId: s.selectedBranchId, displayCurrency: s.displayCurrency })));

  return useMemo(() => {
    const isOwner = user.role === "owner";
    const branches = isOwner ? allBranches : allBranches.filter((b) => b.id === user.branchId);
    let branchId: ID | "all" = isOwner ? selectedBranchId : (user.branchId ?? "all");
    if (branchId !== "all" && !branches.some((b) => b.id === branchId)) branchId = "all";
    const branchIds = branchId === "all" ? branches.map((b) => b.id) : [branchId];
    const set = new Set(branchIds);
    return {
      user,
      isOwner,
      branchId,
      branches,
      scope: { branchIds },
      branch: branchId === "all" ? undefined : branches.find((b) => b.id === branchId),
      inScope: (id) => (id ? set.has(id) : isOwner),
      money: { display: displayCurrency, rate },
    };
  }, [user, allBranches, selectedBranchId, displayCurrency, rate]);
}
