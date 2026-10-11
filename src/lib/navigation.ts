import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Sparkles, FileBarChart, TrendingUp, Landmark, Wallet, ArrowLeftRight, Receipt,
  GitCompareArrows, Calculator, Users, ShoppingBag, FileText, ClipboardList, Package, BarChart3,
  PackagePlus, Building2, UserCog, Tags, Upload, Plug, Bell, Settings, UserCircle,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";
import type { TranslationKey } from "@/lib/i18n";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  permission?: Permission;
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
}

export interface NavGroup {
  id: string;
  labelKey: TranslationKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    labelKey: "nav.group.overview",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/advisor", labelKey: "nav.advisor", icon: Sparkles },
      { href: "/reports", labelKey: "nav.reports", icon: FileBarChart },
      { href: "/forecasting", labelKey: "nav.forecasting", icon: TrendingUp, permission: "forecasting.view" },
    ],
  },
  {
    id: "finance",
    labelKey: "nav.group.finance",
    items: [
      { href: "/banking", labelKey: "nav.banking", icon: Landmark },
      { href: "/accounts", labelKey: "nav.accounts", icon: Wallet },
      { href: "/transactions", labelKey: "nav.transactions", icon: ArrowLeftRight },
      { href: "/bills", labelKey: "nav.bills", icon: Receipt },
      { href: "/reconciliation", labelKey: "nav.reconciliation", icon: GitCompareArrows },
      { href: "/till-balancing", labelKey: "nav.till", icon: Calculator },
    ],
  },
  {
    id: "sales",
    labelKey: "nav.group.sales",
    items: [
      { href: "/customers", labelKey: "nav.customers", icon: Users },
      { href: "/walk-in-sales", labelKey: "nav.walkIn", icon: ShoppingBag },
      { href: "/invoices", labelKey: "nav.invoices", icon: FileText },
      { href: "/planned-purchases", labelKey: "nav.plannedPurchases", icon: ClipboardList },
      { href: "/items", labelKey: "nav.items", icon: Package },
      { href: "/item-sales", labelKey: "nav.itemSales", icon: BarChart3 },
      { href: "/stock-adjustments", labelKey: "nav.stockAdjustments", icon: PackagePlus },
    ],
  },
  {
    id: "business",
    labelKey: "nav.group.business",
    items: [
      { href: "/branches", labelKey: "nav.branches", icon: Building2, permission: "branches.manage" },
      { href: "/branch-managers", labelKey: "nav.managers", icon: UserCog, permission: "managers.manage" },
      { href: "/categories", labelKey: "nav.categories", icon: Tags },
      { href: "/import", labelKey: "nav.import", icon: Upload },
      { href: "/integrations", labelKey: "nav.integrations", icon: Plug, permission: "integrations.manage" },
    ],
  },
  {
    id: "account",
    labelKey: "nav.group.account",
    items: [
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
      { href: "/profile", labelKey: "nav.profile", icon: UserCircle },
    ],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Human labels for path segments, used by breadcrumbs. */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  advisor: "AI Financial Advisor",
  reports: "Monthly Reports",
  forecasting: "Forecasting",
  banking: "Banking Statements",
  accounts: "Financial Accounts",
  transactions: "Transactions",
  bills: "Bills",
  reconciliation: "Reconciliation",
  "till-balancing": "Till Balancing",
  customers: "Customers",
  "walk-in-sales": "Walk-in Sales",
  invoices: "Invoices",
  "planned-purchases": "Planned Purchases",
  items: "Items",
  "item-sales": "Item Sales",
  "stock-adjustments": "Stock Adjustments",
  branches: "Branches",
  "branch-managers": "Branch Managers",
  categories: "Categories",
  import: "Data Import",
  integrations: "Integrations",
  notifications: "Notifications",
  settings: "Settings",
  profile: "Profile",
  new: "New",
  edit: "Edit",
  voice: "Voice-to-Invoice",
  "import-history": "Import History",
  uncategorized: "Uncategorized",
  invite: "Invite",
  preferences: "Preferences",
};
