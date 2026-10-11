import type { Role, User, ID } from "@/types";

/**
 * Frontend permission model for the demo.
 * This only shapes navigation and UI affordances — real authorization
 * must be enforced by the backend on every request.
 */
export type Permission =
  | "branch.switch"
  | "branches.manage"
  | "managers.manage"
  | "forecasting.view"
  | "business.settings"
  | "integrations.manage"
  | "categories.manage"
  | "accounts.manage"
  | "reconciliation.signoff"
  | "till.signoff"
  | "reports.generate"
  | "items.manage"
  | "demo.reset";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "branch.switch",
    "branches.manage",
    "managers.manage",
    "forecasting.view",
    "business.settings",
    "integrations.manage",
    "categories.manage",
    "accounts.manage",
    "reconciliation.signoff",
    "till.signoff",
    "reports.generate",
    "items.manage",
    "demo.reset",
  ],
  manager: ["items.manage"],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Routes that require a permission. Matched by prefix. */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: "/forecasting", permission: "forecasting.view" },
  { prefix: "/branches", permission: "branches.manage" },
  { prefix: "/branch-managers", permission: "managers.manage" },
  { prefix: "/integrations", permission: "integrations.manage" },
  { prefix: "/accounts/new", permission: "accounts.manage" },
];

export function canAccessRoute(role: Role | undefined, pathname: string): boolean {
  const rule = ROUTE_PERMISSIONS.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return rule ? can(role, rule.permission) : true;
}

/** Whether a user may see records belonging to a branch. */
export function canAccessBranch(user: User | undefined, branchId: ID | undefined): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !branchId || user.branchId === branchId;
}
