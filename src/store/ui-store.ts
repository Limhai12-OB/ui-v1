"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Currency, DashboardLayout, DashboardSectionId, ID, Language } from "@/types";

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  order: ["kpis", "health", "alerts", "charts", "transactions"],
  hidden: [],
};

/** UI preferences only — never domain data. */
interface UIState {
  /** Owner's branch filter. Managers are always scoped to their own branch (see useScope). */
  selectedBranchId: ID | "all";
  displayCurrency: Currency;
  language: Language;
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  collapsedNavGroups: string[];
  dashboardLayout: DashboardLayout;
  setBranch: (id: ID | "all") => void;
  setDisplayCurrency: (c: Currency) => void;
  setLanguage: (l: Language) => void;
  setTheme: (t: "light" | "dark") => void;
  toggleSidebar: () => void;
  toggleNavGroup: (id: string) => void;
  setDashboardLayout: (l: DashboardLayout) => void;
  toggleDashboardSection: (id: DashboardSectionId) => void;
  moveDashboardSection: (id: DashboardSectionId, dir: -1 | 1) => void;
  resetDashboardLayout: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      selectedBranchId: "all",
      displayCurrency: "USD",
      language: "en",
      theme: "light",
      sidebarCollapsed: false,
      collapsedNavGroups: [],
      dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
      setBranch: (selectedBranchId) => set({ selectedBranchId }),
      setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleNavGroup: (id) =>
        set((s) => ({
          collapsedNavGroups: s.collapsedNavGroups.includes(id)
            ? s.collapsedNavGroups.filter((g) => g !== id)
            : [...s.collapsedNavGroups, id],
        })),
      setDashboardLayout: (dashboardLayout) => set({ dashboardLayout }),
      toggleDashboardSection: (id) =>
        set((s) => {
          const hidden = s.dashboardLayout.hidden.includes(id)
            ? s.dashboardLayout.hidden.filter((h) => h !== id)
            : [...s.dashboardLayout.hidden, id];
          return { dashboardLayout: { ...s.dashboardLayout, hidden } };
        }),
      moveDashboardSection: (id, dir) =>
        set((s) => {
          const order = [...s.dashboardLayout.order];
          const i = order.indexOf(id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= order.length) return s;
          [order[i], order[j]] = [order[j], order[i]];
          return { dashboardLayout: { ...s.dashboardLayout, order } };
        }),
      resetDashboardLayout: () => set({ dashboardLayout: DEFAULT_DASHBOARD_LAYOUT }),
    }),
    { name: "lv-ui", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
