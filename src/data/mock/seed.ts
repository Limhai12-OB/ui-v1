/**
 * Deterministic seed dataset for the LedgerVision demo.
 *
 * Business: Angkor Fresh Mart Co., Ltd. — a fictional mini-mart chain with
 * branches in Phnom Penh and Siem Reap. ~6 months of history (Apr–Oct 2026)
 * generated from a seeded PRNG so every run produces identical numbers.
 *
 * Built-in story (used by the AI Advisor and reports):
 *  - From 1 Sep 2026 the beverage supplier raised prices ~9%, lifting inventory costs.
 *  - Siem Reap runs a generator during September outages (extra fuel cost).
 *  - Sen Sok branch opened 1 Oct 2026, so it has < 30 days of sales history.
 */
import type {
  AdvisorConversation,
  AppNotification,
  Bill,
  Branch,
  BranchManager,
  Business,
  Category,
  Customer,
  FinancialAccount,
  ImportBatch,
  Integration,
  Invoice,
  Item,
  MonthlyReport,
  NotificationPreferences,
  Payment,
  PaymentMethod,
  PlannedPurchase,
  ReconLine,
  Reconciliation,
  Sale,
  StockAdjustment,
  StockMovement,
  TargetBudget,
  TillDenomination,
  TillSession,
  Transaction,
  User,
  WhatIfScenario,
  ID,
  ISODate,
} from "@/types";
import { addDaysISO, DEMO_TODAY } from "@/lib/date";
import { roundMoney } from "@/lib/currency";
import { parseISO } from "date-fns";

export interface SeedData {
  business: Business;
  users: User[];
  branches: Branch[];
  managers: BranchManager[];
  categories: Category[];
  accounts: FinancialAccount[];
  transactions: Transaction[];
  customers: Customer[];
  invoices: Invoice[];
  plannedPurchases: PlannedPurchase[];
  bills: Bill[];
  items: Item[];
  stockMovements: StockMovement[];
  stockAdjustments: StockAdjustment[];
  sales: Sale[];
  imports: ImportBatch[];
  reconciliations: Reconciliation[];
  tillSessions: TillSession[];
  notifications: AppNotification[];
  notificationPreferences: NotificationPreferences;
  integrations: Integration[];
  reports: MonthlyReport[];
  conversations: AdvisorConversation[];
  scenarios: WhatIfScenario[];
  targetBudgets: TargetBudget[];
}

/* ------------------------------------------------------------------ */
/* PRNG                                                                */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const KHR_PER_USD = 4100;
export const HISTORY_START: ISODate = "2026-04-01";

export const BRANCH_IDS = { main: "br_main", tk: "br_tk", sr: "br_sr", ss: "br_ss" } as const;
export const OWNER_ID = "user_owner";
export const MANAGER_USER_ID = "user_mgr_dara";

export function createSeedData(): SeedData {
  const rand = mulberry32(20261011);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  let seq = 0;
  const id = (p: string) => `${p}_${(++seq).toString(36).padStart(4, "0")}`;
  const ts = (date: ISODate, hour = 9, min = 0) =>
    `${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000+07:00`;
  const usd = (n: number) => roundMoney(n, "USD");
  const khr = (n: number) => Math.round(n / 100) * 100;

  /* ---------------- Business, users, branches ---------------- */

  const business: Business = {
    id: "biz_angkorfresh",
    name: "Angkor Fresh Mart Co., Ltd.",
    email: "accounts@angkorfresh.demo",
    phone: "+855 23 880 412",
    address: "No. 45, Street 278, Sangkat Boeng Keng Kang I, Phnom Penh",
    country: "Cambodia",
    defaultCurrency: "USD",
    khrPerUsd: KHR_PER_USD,
    khrRateUpdatedAt: ts("2026-10-01", 8),
    fiscalYearStartMonth: 1,
    createdAt: ts("2024-01-08"),
  };

  const users: User[] = [
    {
      id: OWNER_ID,
      name: "Sophea Chan",
      email: "sophea.chan@angkorfresh.demo",
      phone: "+855 12 345 678",
      role: "owner",
      avatarInitials: "SC",
      authProvider: "password+google",
      createdAt: ts("2024-01-08"),
    },
    {
      id: MANAGER_USER_ID,
      name: "Dara Kim",
      email: "dara.kim@angkorfresh.demo",
      phone: "+855 17 220 914",
      role: "manager",
      branchId: BRANCH_IDS.tk,
      avatarInitials: "DK",
      authProvider: "password",
      createdAt: ts("2024-06-20"),
    },
  ];

  const branches: Branch[] = [
    { id: BRANCH_IDS.main, name: "Main Branch – BKK1", code: "PP-BKK", address: "No. 45, Street 278, BKK1", city: "Phnom Penh", phone: "+855 23 880 412", isMain: true, status: "active", openedAt: "2024-01-15" },
    { id: BRANCH_IDS.tk, name: "Toul Kork", code: "PP-TK", address: "No. 112, Street 315, Boeng Kak II", city: "Phnom Penh", phone: "+855 23 990 115", isMain: false, status: "active", openedAt: "2024-07-01", managerId: "mgr_dara" },
    { id: BRANCH_IDS.sr, name: "Siem Reap – Wat Bo", code: "SR-WB", address: "Wat Bo Road, Sala Kamreuk", city: "Siem Reap", phone: "+855 63 760 228", isMain: false, status: "active", openedAt: "2025-02-10", managerId: "mgr_vannak" },
    { id: BRANCH_IDS.ss, name: "Sen Sok", code: "PP-SS", address: "Street 1986, Phnom Penh Thmei", city: "Phnom Penh", phone: "+855 23 660 301", isMain: false, status: "active", openedAt: "2026-10-01", managerId: "mgr_sreymom" },
  ];

  const managers: BranchManager[] = [
    { id: "mgr_dara", name: "Dara Kim", email: "dara.kim@angkorfresh.demo", phone: "+855 17 220 914", branchId: BRANCH_IDS.tk, status: "active", invitedAt: ts("2024-06-18"), joinedAt: ts("2024-06-20"), lastActiveAt: ts("2026-10-10", 19, 42) },
    { id: "mgr_vannak", name: "Vannak Heng", email: "vannak.heng@angkorfresh.demo", phone: "+855 92 418 330", branchId: BRANCH_IDS.sr, status: "active", invitedAt: ts("2025-01-28"), joinedAt: ts("2025-01-29"), lastActiveAt: ts("2026-10-10", 21, 5) },
    { id: "mgr_sreymom", name: "Sreymom Ly", email: "sreymom.ly@angkorfresh.demo", phone: "+855 10 772 615", branchId: BRANCH_IDS.ss, status: "invited", invitedAt: ts("2026-10-08", 14, 20), mustChangePassword: true },
  ];

  /* ---------------- Categories ---------------- */

  const categories: Category[] = [
    { id: "cat_sales", name: "Retail Sales", nameKm: "ការលក់រាយ", kind: "income", isSystem: true, description: "Walk-in and POS sales" },
    { id: "cat_wholesale", name: "Wholesale Sales", nameKm: "ការលក់ដុំ", kind: "income", isSystem: true, description: "Invoice payments from wholesale customers" },
    { id: "cat_other_income", name: "Other Income", nameKm: "ចំណូលផ្សេងៗ", kind: "income", description: "Interest, rebates, refunds" },
    { id: "cat_cogs", name: "Inventory Purchases", nameKm: "ការទិញស្តុក", kind: "expense", isSystem: true, description: "Stock bought from suppliers" },
    { id: "cat_rent", name: "Rent", nameKm: "ថ្លៃជួល", kind: "expense" },
    { id: "cat_salaries", name: "Salaries & Wages", nameKm: "ប្រាក់ខែ", kind: "expense" },
    { id: "cat_utilities", name: "Utilities", nameKm: "ទឹកភ្លើង", kind: "expense", description: "Electricity, water, internet" },
    { id: "cat_transport", name: "Transport & Delivery", nameKm: "ដឹកជញ្ជូន", kind: "expense" },
    { id: "cat_marketing", name: "Marketing", nameKm: "ទីផ្សារ", kind: "expense" },
    { id: "cat_maintenance", name: "Repairs & Maintenance", nameKm: "ជួសជុល", kind: "expense" },
    { id: "cat_fees", name: "Bank & Payment Fees", nameKm: "កម្រៃធនាគារ", kind: "expense" },
    { id: "cat_supplies", name: "Store Supplies", nameKm: "សម្ភារៈហាង", kind: "expense" },
    { id: "cat_tax", name: "Taxes & Licenses", nameKm: "ពន្ធ", kind: "expense" },
    { id: "icat_bev", name: "Beverages", nameKm: "ភេសជ្ជៈ", kind: "item" },
    { id: "icat_rice", name: "Rice & Grains", nameKm: "អង្ករ", kind: "item" },
    { id: "icat_spice", name: "Spices & Condiments", nameKm: "គ្រឿងទេស", kind: "item" },
    { id: "icat_snacks", name: "Snacks", nameKm: "នំចំណី", kind: "item" },
    { id: "icat_coffee", name: "Coffee & Tea", nameKm: "កាហ្វេ និងតែ", kind: "item" },
    { id: "icat_household", name: "Household", nameKm: "គ្រឿងប្រើប្រាស់", kind: "item" },
    { id: "icat_fresh", name: "Fresh Produce", nameKm: "បន្លែផ្លែឈើ", kind: "item" },
  ];

  /* ---------------- Accounts ---------------- */

  const accounts: FinancialAccount[] = [
    { id: "acc_aba_usd", name: "ABA Business USD", type: "bank", provider: "ABA", accountNumber: "•••• 4821", currency: "USD", branchId: BRANCH_IDS.main, openingBalance: 26500, openingDate: HISTORY_START, status: "active" },
    { id: "acc_aba_khr", name: "ABA Business KHR", type: "bank", provider: "ABA", accountNumber: "•••• 7730", currency: "KHR", branchId: BRANCH_IDS.main, openingBalance: 21_000_000, openingDate: HISTORY_START, status: "active" },
    { id: "acc_acleda_usd", name: "ACLEDA Current USD", type: "bank", provider: "ACLEDA", accountNumber: "•••• 1094", currency: "USD", branchId: BRANCH_IDS.tk, openingBalance: 9200, openingDate: HISTORY_START, status: "active" },
    { id: "acc_wing_usd", name: "Wing Business Wallet", type: "ewallet", provider: "Wing", accountNumber: "•••• 5512", currency: "USD", branchId: BRANCH_IDS.sr, openingBalance: 3400, openingDate: HISTORY_START, status: "active" },
    { id: "acc_cash_main", name: "BKK1 Cash Drawer (USD)", type: "cash", provider: "Cash", accountNumber: "Till 1", currency: "USD", branchId: BRANCH_IDS.main, openingBalance: 300, openingDate: HISTORY_START, status: "active" },
    { id: "acc_cash_main_khr", name: "BKK1 Cash Drawer (KHR)", type: "cash", provider: "Cash", accountNumber: "Till 1", currency: "KHR", branchId: BRANCH_IDS.main, openingBalance: 800_000, openingDate: HISTORY_START, status: "active" },
    { id: "acc_cash_tk", name: "Toul Kork Cash Drawer", type: "cash", provider: "Cash", accountNumber: "Till 1", currency: "USD", branchId: BRANCH_IDS.tk, openingBalance: 200, openingDate: HISTORY_START, status: "active" },
    { id: "acc_cash_sr", name: "Siem Reap Cash Drawer", type: "cash", provider: "Cash", accountNumber: "Till 1", currency: "USD", branchId: BRANCH_IDS.sr, openingBalance: 200, openingDate: HISTORY_START, status: "active" },
    { id: "acc_cash_ss", name: "Sen Sok Cash Drawer", type: "cash", provider: "Cash", accountNumber: "Till 1", currency: "USD", branchId: BRANCH_IDS.ss, openingBalance: 150, openingDate: "2026-10-01", status: "active" },
  ];

  const branchAccounts: Record<string, { cash: ID; bank: ID; cashKhr?: ID }> = {
    [BRANCH_IDS.main]: { cash: "acc_cash_main", bank: "acc_aba_usd", cashKhr: "acc_cash_main_khr" },
    [BRANCH_IDS.tk]: { cash: "acc_cash_tk", bank: "acc_acleda_usd" },
    [BRANCH_IDS.sr]: { cash: "acc_cash_sr", bank: "acc_wing_usd" },
    [BRANCH_IDS.ss]: { cash: "acc_cash_ss", bank: "acc_aba_usd" },
  };

  /* ---------------- Items ---------------- */

  type ItemDef = [sku: string, name: string, nameKm: string, cat: string, unit: string, sell: number, cost: number, reorder: number];
  const itemDefs: ItemDef[] = [
    ["BEV-001", "Lager Beer Can 330ml (24)", "ស្រាបៀរកំប៉ុង ៣៣០ml", "icat_bev", "case", 16.8, 13.4, 12],
    ["BEV-002", "Draft Beer Can 500ml (24)", "ស្រាបៀរស្រស់ ៥០០ml", "icat_bev", "case", 21.5, 17.6, 8],
    ["BEV-003", "Drinking Water 1.5L (6-pack)", "ទឹកសុទ្ធ ១.៥L", "icat_bev", "pack", 2.4, 1.6, 40],
    ["BEV-004", "Coconut Water 330ml", "ទឹកដូង", "icat_bev", "bottle", 1.25, 0.72, 48],
    ["BEV-005", "Green Tea Bottle 500ml", "តែបៃតង", "icat_bev", "bottle", 0.9, 0.52, 60],
    ["BEV-006", "Iced Coffee Can 240ml", "កាហ្វេទឹកកកកំប៉ុង", "icat_bev", "can", 0.85, 0.48, 60],
    ["RIC-001", "Phka Rumduol Jasmine Rice 25kg", "អង្ករផ្ការំដួល ២៥kg", "icat_rice", "bag", 31.0, 25.5, 10],
    ["RIC-002", "Phka Malis Rice 5kg", "អង្ករផ្កាម្លិះ ៥kg", "icat_rice", "bag", 7.2, 5.6, 20],
    ["SPC-001", "Kampot Black Pepper 100g", "ម្រេចកំពត", "icat_spice", "pack", 4.5, 2.8, 25],
    ["SPC-002", "Kampong Speu Palm Sugar 500g", "ស្ករត្នោត", "icat_spice", "pack", 2.2, 1.35, 25],
    ["SPC-003", "Fish Sauce 700ml", "ទឹកត្រី", "icat_spice", "bottle", 1.6, 0.98, 30],
    ["SPC-004", "Kampot Sea Salt 500g", "អំបិលកំពត", "icat_spice", "pack", 0.95, 0.5, 30],
    ["SNK-001", "Dried Mango 200g", "ស្វាយក្រៀម", "icat_snacks", "pack", 3.2, 2.0, 24],
    ["SNK-002", "Roasted Cashew Nuts 250g", "គ្រាប់ស្វាយចន្ទី", "icat_snacks", "pack", 5.5, 3.6, 20],
    ["SNK-003", "Instant Noodles Chicken (30)", "មីកញ្ចប់ (៣០)", "icat_snacks", "case", 8.5, 6.4, 15],
    ["SNK-004", "Rice Crackers 150g", "នំអង្ករ", "icat_snacks", "pack", 1.4, 0.82, 30],
    ["COF-001", "Mondulkiri Arabica Coffee 250g", "កាហ្វេមណ្ឌលគិរី", "icat_coffee", "pack", 7.9, 4.9, 15],
    ["COF-002", "Jasmine Tea Leaves 100g", "តែផ្កាម្លិះ", "icat_coffee", "pack", 2.6, 1.5, 15],
    ["HOU-001", "Laundry Detergent 3kg", "ម្សៅសាប៊ូ ៣kg", "icat_household", "bag", 6.8, 5.1, 12],
    ["HOU-002", "Dishwashing Liquid 800ml", "ទឹកលាងចាន", "icat_household", "bottle", 1.9, 1.15, 20],
    ["HOU-003", "Toilet Tissue (10 rolls)", "ក្រដាសអនាម័យ", "icat_household", "pack", 3.4, 2.3, 20],
    ["HOU-004", "Soybean Cooking Oil 1L", "ប្រេងឆា ១L", "icat_household", "bottle", 2.3, 1.7, 30],
    ["FRE-001", "Fresh Eggs (tray of 30)", "ពងមាន់ (៣០)", "icat_fresh", "tray", 4.2, 3.3, 15],
    ["FRE-002", "Limes 1kg", "ក្រូចឆ្មារ ១kg", "icat_fresh", "kg", 1.8, 1.1, 10],
  ];

  const activeBranchesForStock = [BRANCH_IDS.main, BRANCH_IDS.tk, BRANCH_IDS.sr, BRANCH_IDS.ss];
  const branchStockFactor: Record<string, number> = { br_main: 1.4, br_tk: 1.0, br_sr: 0.8, br_ss: 0.45 };

  const items: Item[] = itemDefs.map(([sku, name, nameKm, cat, unit, sell, cost, reorder], i) => ({
    id: `itm_${sku.toLowerCase().replace("-", "")}`,
    sku,
    name,
    nameKm,
    categoryId: cat,
    unit,
    sellingPrice: sell,
    costPrice: cost,
    currency: "USD",
    reorderLevel: reorder,
    status: i === 17 ? "active" : "active",
    barcode: `885${String(1000000 + i * 7919).slice(0, 7)}${i % 10}`,
    stock: {},
    createdAt: ts("2024-01-10"),
  }));

  /* ---------------- Transactions ---------------- */

  const transactions: Transaction[] = [];
  const addTx = (t: Omit<Transaction, "id" | "createdAt" | "createdBy" | "status" | "reconciled"> & Partial<Pick<Transaction, "status" | "reconciled" | "createdBy">>) => {
    const tx: Transaction = {
      id: id("tx"),
      status: "posted",
      reconciled: t.date < "2026-09-01",
      createdBy: t.createdBy ?? "Sophea Chan",
      createdAt: ts(t.date, 18, Math.floor(rand() * 59)),
      ...t,
    };
    transactions.push(tx);
    return tx;
  };

  const days: ISODate[] = [];
  for (let d = HISTORY_START; d <= DEMO_TODAY; d = addDaysISO(d, 1)) days.push(d);

  const baseDaily: Record<string, number> = { br_main: 1450, br_tk: 980, br_sr: 720, br_ss: 380 };
  const branchOpen = (b: string, d: ISODate) => (b === BRANCH_IDS.ss ? d >= "2026-10-01" : true);
  const cashBal: Record<string, number> = { acc_cash_main: 300, acc_cash_tk: 200, acc_cash_sr: 200, acc_cash_ss: 150 };
  const FLOAT: Record<string, number> = { acc_cash_main: 300, acc_cash_tk: 200, acc_cash_sr: 200, acc_cash_ss: 150 };
  const dailyCashUSD: Record<string, number> = {}; // `${branch}|${date}` -> cash takings
  const dailyCashKHR: Record<string, number> = {};
  let khrDrawer = 800_000;
  const managerName: Record<string, string> = { br_main: "Sophea Chan", br_tk: "Dara Kim", br_sr: "Vannak Heng", br_ss: "Sophea Chan" };
  let retailRevenueByBranchMonth: Record<string, number> = {};

  for (const d of days) {
    const date = parseISO(d);
    const dow = date.getDay();
    const month = date.getMonth() + 1;
    const monthIndex = (date.getFullYear() - 2026) * 12 + month - 4;
    const weekend = dow === 0 || dow === 6 ? 1.22 : 1;

    for (const b of [BRANCH_IDS.main, BRANCH_IDS.tk, BRANCH_IDS.sr, BRANCH_IDS.ss]) {
      if (!branchOpen(b, d)) continue;
      const season = b === BRANCH_IDS.sr && month >= 6 && month <= 9 ? 0.86 : 1;
      const ramp = b === BRANCH_IDS.ss ? 0.7 + 0.03 * Math.min(10, Number(d.slice(8)) - 1) : 1;
      const takings = usd(baseDaily[b] * weekend * season * ramp * (1 + 0.012 * monthIndex) * between(0.86, 1.14));
      const acc = branchAccounts[b];
      const mKey = `${b}|${d.slice(0, 7)}`;
      retailRevenueByBranchMonth[mKey] = (retailRevenueByBranchMonth[mKey] ?? 0) + takings;

      if (b === BRANCH_IDS.main) {
        const cashPart = usd(takings * 0.45);
        const khrPart = khr(takings * 0.2 * KHR_PER_USD);
        const qrPart = usd(takings - cashPart - takings * 0.2);
        addTx({ date: d, type: "income", amount: cashPart, currency: "USD", accountId: acc.cash, categoryId: "cat_sales", branchId: b, description: "POS daily takings – cash (USD)", counterparty: "Walk-in customers", source: "integration", reference: `POS-${d.replace(/-/g, "")}-BKK` });
        addTx({ date: d, type: "income", amount: khrPart, currency: "KHR", accountId: acc.cashKhr!, categoryId: "cat_sales", branchId: b, description: "POS daily takings – cash (KHR)", counterparty: "Walk-in customers", source: "integration", reference: `POS-${d.replace(/-/g, "")}-BKK-R` });
        addTx({ date: d, type: "income", amount: qrPart, currency: "USD", accountId: acc.bank, categoryId: "cat_sales", branchId: b, description: "KHQR settlement – POS", counterparty: "ABA KHQR", source: "integration", reference: `KHQR-${d.replace(/-/g, "")}` });
        cashBal[acc.cash] += cashPart;
        khrDrawer += khrPart;
        dailyCashUSD[`${b}|${d}`] = cashPart;
        dailyCashKHR[`${b}|${d}`] = khrPart;
      } else {
        const cashShare = b === BRANCH_IDS.tk ? 0.6 : b === BRANCH_IDS.sr ? 0.55 : 0.7;
        const cashPart = usd(takings * cashShare);
        const qrPart = usd(takings - cashPart);
        addTx({ date: d, type: "income", amount: cashPart, currency: "USD", accountId: acc.cash, categoryId: "cat_sales", branchId: b, description: "POS daily takings – cash", counterparty: "Walk-in customers", source: "integration", reference: `POS-${d.replace(/-/g, "")}-${b.slice(3).toUpperCase()}`, createdBy: managerName[b] });
        addTx({ date: d, type: "income", amount: qrPart, currency: "USD", accountId: acc.bank, categoryId: "cat_sales", branchId: b, description: b === BRANCH_IDS.sr ? "Wing merchant settlement" : "KHQR settlement – POS", counterparty: b === BRANCH_IDS.sr ? "Wing" : "KHQR", source: "integration", reference: `QR-${d.replace(/-/g, "")}-${b.slice(3).toUpperCase()}`, createdBy: managerName[b] });
        cashBal[acc.cash] += cashPart;
        dailyCashUSD[`${b}|${d}`] = cashPart;
      }

      // Inventory purchases (Tue & Fri), cost ratio rises from September (supplier price increase)
      if (dow === 2 || dow === 5) {
        const ratio = d >= "2026-09-01" ? 0.612 : 0.558;
        const amt = usd(baseDaily[b] * season * ramp * 3.6 * ratio * between(0.9, 1.1));
        const bev = rand() < 0.5;
        addTx({ date: d, type: "expense", amount: amt, currency: "USD", accountId: acc.bank, categoryId: "cat_cogs", branchId: b, description: bev ? "Beverage restock" : "Dry goods restock", counterparty: bev ? "Mekong Beverage Distribution" : pick(["Golden Harvest Trading", "Battambang Rice Mill", "Kampot Spice Collective", "Orussey Wholesale Market"]), source: "manual", reference: `PO-${d.replace(/-/g, "")}-${b.slice(3).toUpperCase()}`, createdBy: managerName[b] });
      }

      // Weekly cash deposit (Monday): move drawer cash above float to the bank
      if (dow === 1 && cashBal[acc.cash] - FLOAT[acc.cash] > 50) {
        const dep = usd(cashBal[acc.cash] - FLOAT[acc.cash]);
        addTx({ date: d, type: "transfer", amount: dep, currency: "USD", accountId: acc.cash, toAccountId: acc.bank, branchId: b, description: "Weekly cash deposit to bank", source: "manual", reference: `DEP-${d.replace(/-/g, "")}`, createdBy: managerName[b] });
        cashBal[acc.cash] -= dep;
        if (acc.cashKhr && khrDrawer > 400_000) {
          const depK = khrDrawer - 400_000;
          addTx({ date: d, type: "transfer", amount: depK, currency: "KHR", accountId: acc.cashKhr, toAccountId: "acc_aba_khr", branchId: b, description: "Weekly riel cash deposit to bank", source: "manual", reference: `DEPR-${d.replace(/-/g, "")}` });
          khrDrawer -= depK;
        }
      }
    }

    // Monthly fixed costs
    const dom = date.getDate();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const rents: Record<string, number> = { br_main: 3200, br_tk: 2100, br_sr: 1500, br_ss: 1800 };
    const salaries: Record<string, number> = { br_main: 5800, br_tk: 3900, br_sr: 3100, br_ss: 2400 };
    for (const b of Object.keys(rents)) {
      if (!branchOpen(b, d)) continue;
      const bank = branchAccounts[b].bank;
      if (dom === 1) addTx({ date: d, type: "expense", amount: rents[b], currency: "USD", accountId: bank, categoryId: "cat_rent", branchId: b, description: `Shop rent – ${d.slice(0, 7)}`, counterparty: b === "br_sr" ? "Wat Bo Properties" : "Landlord – Mr. Pich Rithy", source: "manual", reference: `RENT-${d.slice(0, 7)}` });
      if (dom === lastDay) addTx({ date: d, type: "expense", amount: usd(salaries[b] * between(0.98, 1.04)), currency: "USD", accountId: bank, categoryId: "cat_salaries", branchId: b, description: `Staff payroll – ${d.slice(0, 7)}`, counterparty: "Staff payroll", source: "manual", reference: `PAY-${d.slice(0, 7)}` });
      if (dom === 12) {
        const elec: Record<string, number> = { br_main: 2_900_000, br_tk: 1_850_000, br_sr: 1_600_000, br_ss: 1_100_000 };
        addTx({ date: d, type: "expense", amount: khr(elec[b] * between(0.92, 1.12)), currency: "KHR", accountId: "acc_aba_khr", categoryId: "cat_utilities", branchId: b, description: "EDC electricity bill", counterparty: "EDC Electricity", source: "manual", reference: `EDC-${d.slice(0, 7)}-${b.slice(3).toUpperCase()}` });
        addTx({ date: d, type: "expense", amount: khr(between(180_000, 320_000)), currency: "KHR", accountId: "acc_aba_khr", categoryId: "cat_utilities", branchId: b, description: "Water supply bill", counterparty: "Municipal Water Supply", source: "manual" });
        addTx({ date: d, type: "expense", amount: b === "br_main" ? 45 : 35, currency: "USD", accountId: bank, categoryId: "cat_utilities", branchId: b, description: "Fibre internet", counterparty: "City Fibre ISP", source: "manual" });
      }
      if (dom === 20 && b !== "br_ss") {
        const rev = retailRevenueByBranchMonth[`${b}|${d.slice(0, 7)}`] ?? 0;
        addTx({ date: d, type: "expense", amount: usd(rev * 0.012), currency: "USD", accountId: bank, categoryId: "cat_tax", branchId: b, description: "Monthly tax prepayment (1%)", counterparty: "General Department of Taxation", source: "manual" });
      }
      if (dom === 28) addTx({ date: d, type: "expense", amount: usd(between(9, 16)), currency: "USD", accountId: bank, categoryId: "cat_fees", branchId: b, description: "Account & QR merchant fees", counterparty: branchAccounts[b].bank === "acc_wing_usd" ? "Wing" : branchAccounts[b].bank === "acc_acleda_usd" ? "ACLEDA Bank" : "ABA Bank", source: "manual" });
    }
    if (dom === 5) addTx({ date: d, type: "expense", amount: d.startsWith("2026-09") ? 680 : usd(between(260, 380)), currency: "USD", accountId: "acc_aba_usd", categoryId: "cat_marketing", branchId: BRANCH_IDS.main, description: d.startsWith("2026-09") ? "Pchum Ben promotion campaign" : "Facebook & Telegram ads", counterparty: "Meta Ads", source: "manual" });
    if (dow === 3) {
      for (const b of [BRANCH_IDS.main, BRANCH_IDS.tk, BRANCH_IDS.sr]) {
        addTx({ date: d, type: "expense", amount: khr(between(160_000, 320_000)), currency: "KHR", accountId: b === BRANCH_IDS.main ? "acc_cash_main_khr" : "acc_aba_khr", categoryId: "cat_transport", branchId: b, description: "Tuk-tuk & van deliveries", counterparty: "Local delivery drivers", source: "manual", createdBy: managerName[b] });
      }
    }
    if (dom === 15 || dom === 1) {
      for (const b of [BRANCH_IDS.main, BRANCH_IDS.tk, BRANCH_IDS.sr]) {
        addTx({ date: d, type: "expense", amount: usd(between(55, 125)), currency: "USD", accountId: branchAccounts[b].bank, categoryId: "cat_supplies", branchId: b, description: "Bags, receipts paper, cleaning", counterparty: "Phsar Thmei Supplies", source: "manual", createdBy: managerName[b] });
      }
    }
    // Siem Reap generator fuel during September outages
    if (d.startsWith("2026-09") && dow === 4) {
      addTx({ date: d, type: "expense", amount: usd(between(95, 140)), currency: "USD", accountId: "acc_wing_usd", categoryId: "cat_utilities", branchId: BRANCH_IDS.sr, description: "Generator diesel – power outage", counterparty: "Tela Fuel Station", source: "manual", createdBy: "Vannak Heng" });
    }
    if (d === "2026-06-18") addTx({ date: d, type: "expense", amount: 1240, currency: "USD", accountId: "acc_aba_usd", categoryId: "cat_maintenance", branchId: BRANCH_IDS.main, description: "Chiller compressor replacement", counterparty: "Cool Tech Services", source: "manual" });
    if (d === "2026-09-09") addTx({ date: d, type: "expense", amount: 860, currency: "USD", accountId: "acc_acleda_usd", categoryId: "cat_maintenance", branchId: BRANCH_IDS.tk, description: "Freezer repair & shelving", counterparty: "Cool Tech Services", source: "manual", createdBy: "Dara Kim" });
    if (dom === 25) addTx({ date: d, type: "income", amount: usd(between(18, 32)), currency: "USD", accountId: "acc_aba_usd", categoryId: "cat_other_income", branchId: BRANCH_IDS.main, description: "Supplier volume rebate", counterparty: "Mekong Beverage Distribution", source: "manual" });
  }
  retailRevenueByBranchMonth = {};

  /* ---------------- Customers ---------------- */

  const customers: Customer[] = [
    { id: "cus_riverside", name: "Riverside Bistro", type: "wholesale", contactName: "Mr. Sokun Meas", phone: "+855 12 811 204", email: "orders@riversidebistro.demo", address: "Sisowath Quay, Daun Penh", telegram: "@riversidebistro", branchId: BRANCH_IDS.main, paymentTermsDays: 15, createdAt: ts("2025-03-02") },
    { id: "cus_lucky", name: "Lucky Café Toul Kork", type: "wholesale", contactName: "Ms. Chenda Ouk", phone: "+855 77 302 118", email: "lucky.cafe@demo.kh", address: "Street 516, Toul Kork", branchId: BRANCH_IDS.tk, paymentTermsDays: 7, createdAt: ts("2025-05-14") },
    { id: "cus_paradise", name: "Angkor Paradise Guesthouse", type: "wholesale", contactName: "Mr. Rotha Chea", phone: "+855 63 965 440", email: "purchasing@angkorparadise.demo", address: "Taphul Road, Siem Reap", telegram: "@angkorparadise_gh", branchId: BRANCH_IDS.sr, paymentTermsDays: 30, createdAt: ts("2025-03-20") },
    { id: "cus_golden", name: "Golden Lotus Restaurant", type: "wholesale", contactName: "Mrs. Leakhena Phan", phone: "+855 16 540 771", email: "goldenlotus@demo.kh", address: "Street 63, BKK1", branchId: BRANCH_IDS.main, paymentTermsDays: 15, createdAt: ts("2024-11-11") },
    { id: "cus_sovann", name: "Sovann Mini Mart", type: "wholesale", contactName: "Mr. Visal Sok", phone: "+855 89 663 205", address: "Russian Market area, Toul Tom Poung", branchId: BRANCH_IDS.main, paymentTermsDays: 14, createdAt: ts("2025-08-01") },
    { id: "cus_kampot", name: "Kampot Pepper House", type: "wholesale", contactName: "Ms. Nary Kong", phone: "+855 70 118 942", email: "hello@kampotpepperhouse.demo", address: "Street 240, Daun Penh", branchId: BRANCH_IDS.main, paymentTermsDays: 30, createdAt: ts("2025-10-09") },
    { id: "cus_boeng", name: "Boeng Kak Noodle Shop", type: "wholesale", contactName: "Mr. Heng Lim", phone: "+855 96 427 330", address: "Street 93, Boeng Kak", branchId: BRANCH_IDS.tk, paymentTermsDays: 7, createdAt: ts("2026-01-16") },
    { id: "cus_pubstreet", name: "Pub Street Bar & Grill", type: "wholesale", contactName: "Mr. Kosal Nuon", phone: "+855 81 902 516", email: "bar@pubstreetgrill.demo", address: "Pub Street, Siem Reap", branchId: BRANCH_IDS.sr, paymentTermsDays: 14, createdAt: ts("2025-06-05") },
    { id: "cus_walk_bopha", name: "Bopha Sim (regular)", type: "walk_in", phone: "+855 12 900 331", branchId: BRANCH_IDS.main, paymentTermsDays: 0, createdAt: ts("2026-02-03"), notes: "Loyalty card #1042" },
    { id: "cus_walk_ratana", name: "Ratana Yim (regular)", type: "walk_in", phone: "+855 15 223 784", branchId: BRANCH_IDS.tk, paymentTermsDays: 0, createdAt: ts("2026-03-21"), notes: "Loyalty card #1077" },
    { id: "cus_walk_piseth", name: "Piseth Long (regular)", type: "walk_in", phone: "+855 97 310 662", branchId: BRANCH_IDS.sr, paymentTermsDays: 0, createdAt: ts("2026-05-09") },
  ];

  /* ---------------- Invoices ---------------- */

  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const wholesaleItems = items.filter((i) => ["icat_bev", "icat_rice", "icat_spice", "icat_coffee", "icat_household"].includes(i.categoryId));
  const mkLines = (n: number, scale = 1) =>
    Array.from({ length: n }, () => {
      const it = pick(wholesaleItems);
      return { id: id("ln"), itemId: it.id, description: it.name, quantity: Math.max(1, Math.round(between(3, 18) * scale)), unitPrice: usd(it.sellingPrice * 0.94) };
    });

  const invoices: Invoice[] = [];
  const payMethodAccount = (b: ID, method: PaymentMethod) => (method === "cash" ? branchAccounts[b].cash : branchAccounts[b].bank);

  function addInvoicePayment(inv: Invoice, date: ISODate, amount: number, method: PaymentMethod) {
    const accountId = payMethodAccount(inv.branchId, method);
    const cust = customers.find((c) => c.id === inv.customerId)!;
    const tx = addTx({ date, type: "income", amount, currency: inv.currency, accountId, categoryId: "cat_wholesale", branchId: inv.branchId, description: `Payment for ${inv.number}`, counterparty: cust.name, source: "invoice_payment", sourceId: inv.id, reference: inv.number });
    const p: Payment = { id: id("pay"), date, amount, method, accountId, transactionId: tx.id, reference: method === "bank_transfer" ? `TRF${Math.floor(rand() * 9e6)}` : undefined };
    inv.payments.push(p);
  }

  type InvPlan = { cust: string; issue: ISODate; lines: number; pay: "full" | "partial" | "none"; base?: Invoice["baseStatus"]; source?: Invoice["source"] };
  const invPlans: InvPlan[] = [
    { cust: "cus_riverside", issue: "2026-05-04", lines: 3, pay: "full" },
    { cust: "cus_golden", issue: "2026-05-12", lines: 4, pay: "full" },
    { cust: "cus_paradise", issue: "2026-05-20", lines: 3, pay: "full" },
    { cust: "cus_lucky", issue: "2026-06-02", lines: 2, pay: "full" },
    { cust: "cus_kampot", issue: "2026-06-10", lines: 3, pay: "full" },
    { cust: "cus_riverside", issue: "2026-06-22", lines: 3, pay: "full" },
    { cust: "cus_pubstreet", issue: "2026-07-03", lines: 4, pay: "full" },
    { cust: "cus_golden", issue: "2026-07-14", lines: 3, pay: "full" },
    { cust: "cus_sovann", issue: "2026-07-25", lines: 5, pay: "full" },
    { cust: "cus_boeng", issue: "2026-08-04", lines: 2, pay: "full" },
    { cust: "cus_paradise", issue: "2026-08-11", lines: 4, pay: "full" },
    { cust: "cus_riverside", issue: "2026-08-19", lines: 3, pay: "full" },
    { cust: "cus_lucky", issue: "2026-08-28", lines: 2, pay: "full" },
    { cust: "cus_kampot", issue: "2026-08-25", lines: 3, pay: "partial" }, // overdue partial
    { cust: "cus_sovann", issue: "2026-09-02", lines: 4, pay: "none" }, // overdue
    { cust: "cus_golden", issue: "2026-09-08", lines: 3, pay: "full" },
    { cust: "cus_pubstreet", issue: "2026-09-12", lines: 3, pay: "none" }, // overdue
    { cust: "cus_boeng", issue: "2026-09-21", lines: 2, pay: "none" }, // overdue (7 days)
    { cust: "cus_paradise", issue: "2026-09-24", lines: 4, pay: "partial" }, // partial, due Oct 24
    { cust: "cus_riverside", issue: "2026-09-29", lines: 3, pay: "full" },
    { cust: "cus_lucky", issue: "2026-10-02", lines: 2, pay: "none" }, // due Oct 9 -> overdue
    { cust: "cus_golden", issue: "2026-10-03", lines: 3, pay: "none" }, // due Oct 18
    { cust: "cus_kampot", issue: "2026-10-06", lines: 2, pay: "none", source: "planned_purchase" },
    { cust: "cus_riverside", issue: "2026-10-08", lines: 4, pay: "partial" },
    { cust: "cus_paradise", issue: "2026-10-09", lines: 3, pay: "none" },
    { cust: "cus_pubstreet", issue: "2026-08-15", lines: 2, pay: "none", base: "cancelled" },
    { cust: "cus_sovann", issue: "2026-10-10", lines: 3, pay: "none", base: "draft" },
    { cust: "cus_boeng", issue: "2026-10-11", lines: 2, pay: "none", base: "draft", source: "voice" },
  ];

  invPlans.forEach((p, idx) => {
    const cust = customers.find((c) => c.id === p.cust)!;
    const inv: Invoice = {
      id: `inv_${String(idx + 1).padStart(3, "0")}`,
      number: `INV-2026-${String(idx + 1).padStart(4, "0")}`,
      customerId: cust.id,
      branchId: cust.branchId,
      issueDate: p.issue,
      dueDate: addDaysISO(p.issue, cust.paymentTermsDays),
      currency: "USD",
      lines: mkLines(p.lines, cust.type === "wholesale" ? 1 : 0.4),
      discount: idx % 5 === 0 ? 10 : 0,
      taxRate: 10,
      baseStatus: p.base ?? "sent",
      payments: [],
      notes: idx % 4 === 0 ? "Delivery to back entrance before 10:00." : undefined,
      source: p.source ?? "manual",
      createdAt: ts(p.issue, 10),
      sentAt: p.base ? undefined : ts(p.issue, 11),
    };
    const sub = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const total = usd((sub - inv.discount) * 1.1);
    const method: PaymentMethod = rand() < 0.7 ? "bank_transfer" : "cash";
    if (p.pay === "full") addInvoicePayment(inv, addDaysISO(p.issue, Math.min(cust.paymentTermsDays, Math.floor(between(2, 14)))), total, method);
    if (p.pay === "partial") addInvoicePayment(inv, addDaysISO(p.issue, 3), usd(Math.round(total * 0.4)), method);
    invoices.push(inv);
  });

  /* ---------------- Planned purchases ---------------- */

  const ppDefs: { cust: string; created: ISODate; valid: number; status: PlannedPurchase["status"]; invoiceIdx?: number }[] = [
    { cust: "cus_kampot", created: "2026-09-30", valid: 14, status: "converted", invoiceIdx: 22 },
    { cust: "cus_paradise", created: "2026-10-05", valid: 14, status: "sent" },
    { cust: "cus_golden", created: "2026-09-18", valid: 14, status: "sent" }, // expires Oct 2 -> derived expired
    { cust: "cus_pubstreet", created: "2026-10-07", valid: 10, status: "accepted" },
    { cust: "cus_lucky", created: "2026-09-25", valid: 7, status: "rejected" },
    { cust: "cus_sovann", created: "2026-10-10", valid: 14, status: "draft" },
  ];
  const plannedPurchases: PlannedPurchase[] = ppDefs.map((p, i) => {
    const cust = customers.find((c) => c.id === p.cust)!;
    const inv = p.invoiceIdx !== undefined ? invoices[p.invoiceIdx] : undefined;
    const pp: PlannedPurchase = {
      id: `pp_${String(i + 1).padStart(3, "0")}`,
      number: `PP-2026-${String(i + 1).padStart(4, "0")}`,
      customerId: cust.id,
      branchId: cust.branchId,
      createdDate: p.created,
      validUntil: addDaysISO(p.created, p.valid),
      expectedDeliveryDate: addDaysISO(p.created, p.valid + 3),
      currency: "USD",
      lines: inv ? inv.lines.map((l) => ({ ...l, id: id("ln") })) : mkLines(3),
      discount: 0,
      status: p.status,
      convertedInvoiceId: inv?.id,
      notes: "Prices valid while stock lasts. Delivery included within city limits.",
      history: [{ at: ts(p.created, 9), status: "draft" }],
    };
    if (p.status !== "draft") pp.history.push({ at: ts(p.created, 10), status: "sent", note: `Sent via Telegram to ${cust.contactName ?? cust.name}` });
    if (p.status === "accepted" || p.status === "converted") pp.history.push({ at: ts(addDaysISO(p.created, 2), 15), status: "accepted", note: "Customer confirmed by phone" });
    if (p.status === "rejected") pp.history.push({ at: ts(addDaysISO(p.created, 3), 16), status: "rejected", note: "Customer found a cheaper supplier for beverages" });
    if (inv) {
      pp.history.push({ at: ts(inv.issueDate, 10), status: "converted", note: `Converted to ${inv.number}` });
      inv.plannedPurchaseId = pp.id;
    }
    return pp;
  });

  /* ---------------- Bills ---------------- */

  type BillDef = [supplier: string, branch: string, cat: string, issue: ISODate, terms: number, amount: number, desc: string, pay: "full" | "partial" | "none", base?: Bill["baseStatus"], currency?: "USD" | "KHR"];
  const billDefs: BillDef[] = [
    ["Mekong Beverage Distribution", "br_main", "cat_cogs", "2026-07-08", 30, 4280.5, "Beverage consignment – July", "full"],
    ["Battambang Rice Mill", "br_main", "cat_cogs", "2026-07-20", 21, 2550, "Jasmine rice 100 bags", "full"],
    ["Cool Tech Services", "br_main", "cat_maintenance", "2026-08-02", 14, 380, "Quarterly chiller servicing", "full"],
    ["Mekong Beverage Distribution", "br_tk", "cat_cogs", "2026-08-15", 30, 3120.75, "Beverage consignment – August", "full"],
    ["Kampot Spice Collective", "br_main", "cat_cogs", "2026-09-03", 30, 1460, "Pepper, salt & palm sugar", "full"],
    ["Mekong Beverage Distribution", "br_main", "cat_cogs", "2026-09-10", 30, 4910.2, "Beverage consignment – September (new price list)", "partial"],
    ["Golden Harvest Trading", "br_sr", "cat_cogs", "2026-09-05", 30, 1875.4, "Dry goods & snacks", "none"], // overdue Oct 5
    ["Siem Reap Shelving Co.", "br_sr", "cat_maintenance", "2026-09-15", 21, 640, "Additional shelving units", "none"], // overdue Oct 6
    ["Orussey Wholesale Market", "br_tk", "cat_cogs", "2026-09-24", 21, 1320, "Household goods restock", "none"], // due Oct 15
    ["Mekong Beverage Distribution", "br_tk", "cat_cogs", "2026-09-20", 30, 3460.0, "Beverage consignment – Toul Kork", "none"], // due Oct 20
    ["Phnom Penh Packaging Ltd.", "br_main", "cat_supplies", "2026-10-01", 14, 420, "Branded shopping bags (5,000)", "none"], // due Oct 15
    ["Sen Sok Fit-out Contractors", "br_ss", "cat_maintenance", "2026-09-28", 30, 6800, "Sen Sok store fit-out – final instalment", "none"], // due Oct 28
    ["EDC Electricity", "br_ss", "cat_utilities", "2026-10-05", 14, 980_000, "Electricity – connection & first bill", "none", undefined, "KHR"], // due Oct 19
    ["Battambang Rice Mill", "br_tk", "cat_cogs", "2026-10-07", 21, 1980, "Rice restock – Toul Kork", "none"], // due Oct 28
    ["Cool Tech Services", "br_main", "cat_maintenance", "2026-10-10", 14, 260, "Freezer thermostat (quote)", "none", "draft"],
  ];
  const bills: Bill[] = billDefs.map(([supplier, branch, cat, issue, terms, amount, desc, pay, base, currency], i) => {
    const bill: Bill = {
      id: `bill_${String(i + 1).padStart(3, "0")}`,
      number: `BILL-2026-${String(i + 1).padStart(4, "0")}`,
      supplier,
      branchId: branch,
      categoryId: cat,
      issueDate: issue,
      dueDate: addDaysISO(issue, terms),
      currency: currency ?? "USD",
      amount,
      description: desc,
      baseStatus: base ?? "open",
      payments: [],
      source: i === 12 ? "document_import" : "manual",
      createdAt: ts(issue, 14),
    };
    const payOnce = (date: ISODate, amt: number) => {
      const accountId = bill.currency === "KHR" ? "acc_aba_khr" : branchAccounts[branch].bank;
      const tx = addTx({ date, type: "expense", amount: amt, currency: bill.currency, accountId, categoryId: cat, branchId: branch, description: `Payment for ${bill.number} – ${supplier}`, counterparty: supplier, source: "bill_payment", sourceId: bill.id, reference: bill.number });
      bill.payments.push({ id: id("pay"), date, amount: amt, method: "bank_transfer", accountId, transactionId: tx.id });
    };
    if (pay === "full") payOnce(addDaysISO(issue, terms - 3), amount);
    if (pay === "partial") payOnce(addDaysISO(issue, 20), 2500);
    return bill;
  });

  /* ---------------- Stock, sales, adjustments ---------------- */

  const stockMovements: StockMovement[] = [];
  const stockAdjustments: StockAdjustment[] = [];
  const sales: Sale[] = [];
  const STOCK_TAKE: ISODate = "2026-08-27";

  for (const it of items) {
    for (const b of activeBranchesForStock) {
      const date = b === BRANCH_IDS.ss ? "2026-09-30" : STOCK_TAKE;
      const qty = Math.round(it.reorderLevel * branchStockFactor[b] * between(2.2, 3.6));
      it.stock[b] = qty;
      stockMovements.push({ id: id("mv"), itemId: it.id, branchId: b, date, type: b === BRANCH_IDS.ss ? "initial" : "correction", quantityChange: qty, resultingQuantity: qty, reason: b === BRANCH_IDS.ss ? "Opening stock – Sen Sok" : "Quarterly stock take", createdBy: managerName[b], createdAt: ts(date, 20) });
    }
  }

  const move = (itemId: ID, branchId: ID, date: ISODate, type: StockMovement["type"], change: number, reason: string, reference?: string, by = "Sophea Chan") => {
    const it = itemById[itemId];
    it.stock[branchId] = (it.stock[branchId] ?? 0) + change;
    stockMovements.push({ id: id("mv"), itemId, branchId, date, type, quantityChange: change, resultingQuantity: it.stock[branchId], reason, reference, createdBy: by, createdAt: ts(date, 12 + Math.floor(rand() * 8), Math.floor(rand() * 59)) });
  };

  let saleNo = 0;
  let adjNo = 0;
  const methods: PaymentMethod[] = ["cash", "cash", "khqr", "aba_pay", "cash"];
  for (const d of days.filter((x) => x > STOCK_TAKE)) {
    const dow = parseISO(d).getDay();
    for (const b of activeBranchesForStock) {
      if (!branchOpen(b, d) || (b === BRANCH_IDS.ss && d < "2026-10-01")) continue;
      // Supplier deliveries every Saturday restore stock for most items
      if (dow === 6) {
        for (const it of items) {
          const lowTarget = ["itm_bev002", "itm_cof001", "itm_snk002", "itm_fre001"].includes(it.id);
          if (lowTarget) continue;
          const target = Math.round(it.reorderLevel * branchStockFactor[b] * 3);
          const cur = it.stock[b];
          if (cur < target) {
            const q = target - cur;
            adjNo++;
            const adjId = `adj_${String(adjNo).padStart(4, "0")}`;
            move(it.id, b, d, "increase", q, "Supplier delivery received", adjId, managerName[b]);
            if (adjNo % 9 === 0) {
              stockAdjustments.push({ id: adjId, number: `ADJ-2026-${String(stockAdjustments.length + 1).padStart(4, "0")}`, itemId: it.id, branchId: b, date: d, type: "increase", quantity: q, previousQuantity: cur, newQuantity: it.stock[b], reason: "Supplier delivery received", createdBy: managerName[b], createdAt: ts(d, 16) });
            }
          }
        }
      }
      const nSales = b === BRANCH_IDS.main ? 3 : 2;
      for (let s = 0; s < nSales; s++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
          const it = pick(items);
          return { it, qty: 1 + Math.floor(rand() * (it.unit === "case" || it.unit === "bag" ? 2 : 4)) };
        }).filter((l, i, arr) => arr.findIndex((x) => x.it.id === l.it.id) === i && l.it.stock[b] >= l.qty);
        if (!lines.length) continue;
        saleNo++;
        const method = pick(methods);
        const accountId = method === "cash" ? branchAccounts[b].cash : branchAccounts[b].bank;
        const saleId = `sale_${String(saleNo).padStart(4, "0")}`;
        const number = `SL-2026-${String(saleNo).padStart(5, "0")}`;
        const lineItems = lines.map((l) => ({ id: id("ln"), itemId: l.it.id, description: l.it.name, quantity: l.qty, unitPrice: l.it.sellingPrice }));
        const total = usd(lineItems.reduce((x, l) => x + l.quantity * l.unitPrice, 0));
        const regular = rand() < 0.15 ? customers.find((c) => c.type === "walk_in" && c.branchId === b) : undefined;
        const tx = addTx({ date: d, type: "income", amount: total, currency: "USD", accountId, categoryId: "cat_sales", branchId: b, description: `Walk-in sale ${number}`, counterparty: regular?.name ?? "Walk-in customer", source: "walk_in_sale", sourceId: saleId, reference: number, createdBy: managerName[b] });
        sales.push({ id: saleId, number, date: d, branchId: b, channel: "walk_in", customerId: regular?.id, lines: lineItems, currency: "USD", discount: 0, paymentMethod: method, accountId, transactionId: tx.id, createdBy: managerName[b], createdAt: ts(d, 10 + s * 3, Math.floor(rand() * 59)) });
        for (const l of lines) move(l.it.id, b, d, "sale", -l.qty, "Walk-in sale", number, managerName[b]);
        if (method === "cash") dailyCashUSD[`${b}|${d}`] = (dailyCashUSD[`${b}|${d}`] ?? 0) + total;
      }
    }
  }

  // Designed adjustments so the demo has clear low-stock and correction examples
  const designed: { item: ID; branch: ID; date: ISODate; type: StockAdjustment["type"]; target?: number; qty?: number; reason: string; note?: string }[] = [
    { item: "itm_bev002", branch: BRANCH_IDS.main, date: "2026-10-08", type: "correction", target: 6, reason: "Cycle count variance", note: "Two cases found damaged in cold room." },
    { item: "itm_cof001", branch: BRANCH_IDS.tk, date: "2026-10-09", type: "decrease", target: 4, reason: "Expired stock removed" },
    { item: "itm_snk002", branch: BRANCH_IDS.sr, date: "2026-10-09", type: "decrease", target: 0, reason: "Damaged in transit", note: "Carton crushed during Phnom Penh – Siem Reap transport." },
    { item: "itm_fre001", branch: BRANCH_IDS.main, date: "2026-10-10", type: "decrease", target: 9, reason: "Breakage" },
    { item: "itm_ric001", branch: BRANCH_IDS.ss, date: "2026-10-04", type: "increase", qty: 12, reason: "Transfer received from Main Branch" },
    { item: "itm_bev003", branch: BRANCH_IDS.tk, date: "2026-10-06", type: "correction", target: 84, reason: "Cycle count variance" },
  ];
  for (const a of designed) {
    const it = itemById[a.item];
    const prev = it.stock[a.branch];
    const newQty = a.type === "increase" ? prev + (a.qty ?? 0) : (a.target ?? prev);
    const change = newQty - prev;
    adjNo++;
    const adjId = `adj_${String(adjNo).padStart(4, "0")}`;
    move(a.item, a.branch, a.date, a.type, change, a.reason, adjId, managerName[a.branch]);
    stockAdjustments.push({ id: adjId, number: `ADJ-2026-${String(stockAdjustments.length + 1).padStart(4, "0")}`, itemId: a.item, branchId: a.branch, date: a.date, type: a.type, quantity: a.type === "correction" ? newQty : Math.abs(change), previousQuantity: prev, newQuantity: newQty, reason: a.reason, note: a.note, createdBy: managerName[a.branch], createdAt: ts(a.date, 17) });
  }
  stockAdjustments.sort((a, b) => a.date.localeCompare(b.date));
  stockAdjustments.forEach((a, i) => (a.number = `ADJ-2026-${String(i + 1).padStart(4, "0")}`));

  /* ---------------- Imported, uncategorized transactions ---------------- */

  const importNeedsReview = "imp_005";
  const reviewRows: [ISODate, "income" | "expense", number, string, string, string, number][] = [
    ["2026-10-02", "expense", 38.5, "PURCHASE KHQR TELA FUEL ST 1032", "Tela Fuel Station", "cat_transport", 0.91],
    ["2026-10-03", "expense", 129.0, "TRF TO 012 445 908 SOK CHHAY", "Sok Chhay", "cat_maintenance", 0.48],
    ["2026-10-04", "income", 240.0, "TRF FROM 097 331 220 KAMPOT PEPPER HOUSE", "Kampot Pepper House", "cat_wholesale", 0.86],
    ["2026-10-05", "expense", 18.75, "ABA PAY GRAB*TRIP 5521", "Grab", "cat_transport", 0.88],
    ["2026-10-06", "expense", 64.2, "PURCHASE LUCKY SUPERMARKET SORYA", "Lucky Supermarket", "cat_supplies", 0.63],
    ["2026-10-07", "expense", 15.0, "SERVICE CHARGE SMS ALERT", "ABA Bank", "cat_fees", 0.97],
    ["2026-10-08", "expense", 310.0, "TRF TO 088 201 557 PRINT HOUSE PP", "Print House PP", "cat_marketing", 0.71],
    ["2026-10-09", "income", 12.34, "INTEREST CREDIT", "ABA Bank", "cat_other_income", 0.94],
  ];
  const reviewTxIds: ID[] = [];
  for (const [date, type, amount, desc, cp, sug, conf] of reviewRows) {
    const tx = addTx({ date, type, amount, currency: "USD", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, description: desc, counterparty: cp, source: "statement_import", sourceId: importNeedsReview, status: "needs_review", suggestedCategoryId: sug, suggestionConfidence: conf, reconciled: false });
    reviewTxIds.push(tx.id);
  }

  transactions.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));

  /* ---------------- Imports ---------------- */

  const imports: ImportBatch[] = [
    { id: "imp_001", kind: "bank_statement", fileName: "ABA_4821_Aug2026.csv", fileSize: 48_210, bank: "ABA", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, status: "completed", totalRows: 128, importedRows: 124, duplicateRows: 4, errorRows: 0, reviewRows: 0, createdAt: ts("2026-09-02", 9, 14), completedAt: ts("2026-09-02", 9, 16), createdBy: "Sophea Chan", createdRecordIds: [] },
    { id: "imp_002", kind: "bank_statement", fileName: "ABA_4821_Sep2026.csv", fileSize: 51_877, bank: "ABA", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, status: "completed", totalRows: 142, importedRows: 138, duplicateRows: 4, errorRows: 0, reviewRows: 0, createdAt: ts("2026-10-02", 8, 40), completedAt: ts("2026-10-02", 8, 43), createdBy: "Sophea Chan", createdRecordIds: [] },
    { id: "imp_003", kind: "bank_statement", fileName: "Wing_Business_Sep2026.xlsx", fileSize: 33_604, bank: "Wing", accountId: "acc_wing_usd", branchId: BRANCH_IDS.sr, status: "completed", totalRows: 61, importedRows: 61, duplicateRows: 0, errorRows: 0, reviewRows: 0, createdAt: ts("2026-10-03", 10, 5), completedAt: ts("2026-10-03", 10, 6), createdBy: "Vannak Heng", createdRecordIds: [] },
    { id: "imp_004", kind: "bank_statement", fileName: "ACLEDA_1094_Sep_scan.pdf", fileSize: 1_204_551, bank: "ACLEDA", accountId: "acc_acleda_usd", branchId: BRANCH_IDS.tk, status: "failed", totalRows: 0, importedRows: 0, duplicateRows: 0, errorRows: 0, reviewRows: 0, createdAt: ts("2026-10-04", 15, 22), createdBy: "Dara Kim", errorMessage: "Scanned PDF statements are not supported. Export the statement from ACLEDA Unity ToanChet as CSV or Excel and try again.", createdRecordIds: [] },
    { id: importNeedsReview, kind: "bank_statement", fileName: "ABA_4821_01-09Oct2026.csv", fileSize: 9_810, bank: "ABA", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, status: "needs_review", totalRows: 31, importedRows: 21, duplicateRows: 2, errorRows: 0, reviewRows: 8, createdAt: ts("2026-10-10", 9, 2), completedAt: ts("2026-10-10", 9, 4), createdBy: "Sophea Chan", createdRecordIds: reviewTxIds },
    { id: "imp_006", kind: "supplier_bill", fileName: "EDC_SenSok_Oct.jpg", fileSize: 842_310, branchId: BRANCH_IDS.ss, status: "completed", totalRows: 1, importedRows: 1, duplicateRows: 0, errorRows: 0, reviewRows: 0, createdAt: ts("2026-10-05", 11, 30), completedAt: ts("2026-10-05", 11, 34), createdBy: "Sophea Chan", createdRecordIds: ["bill_013"] },
  ];

  /* ---------------- Reconciliations ---------------- */

  const abaSep = transactions.filter((t) => t.date >= "2026-09-01" && t.date <= "2026-09-30" && (t.accountId === "acc_aba_usd" || t.toAccountId === "acc_aba_usd"));
  const signedFor = (t: Transaction, acc: ID) => (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : t.toAccountId === acc ? t.amount : -t.amount);
  const sepLines: ReconLine[] = abaSep.map((t, i) => {
    const amt = signedFor(t, "acc_aba_usd");
    const base: ReconLine = { id: id("rl"), date: t.date, description: t.description.toUpperCase().slice(0, 40), amount: amt, reference: t.reference, state: "matched", transactionId: t.id, matchConfidence: 1 };
    if (i % 17 === 5) return { ...base, state: "suggested", matchConfidence: 0.82 };
    if (i === 23) return { ...base, state: "discrepancy", amount: usd(amt - 0.5), note: "Statement amount differs from ledger by $0.50 (likely QR settlement fee)." };
    return base;
  });
  sepLines.push(
    { id: id("rl"), date: "2026-09-30", description: "MONTHLY SERVICE CHARGE", amount: -5, state: "unmatched", reference: "SC0930" },
    { id: id("rl"), date: "2026-09-30", description: "INTEREST CREDIT", amount: 11.82, state: "unmatched", reference: "INT0930" },
    { id: id("rl"), date: "2026-09-17", description: "TRF FROM 011 908 552 UNKNOWN SENDER", amount: 75, state: "unmatched", reference: "FT2609170045" },
  );
  sepLines.sort((a, b) => a.date.localeCompare(b.date));
  const sepOpen = 0; // computed by UI from lines; opening shown from account history
  const reconciliations: Reconciliation[] = [
    {
      id: "rec_001", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, periodStart: "2026-08-01", periodEnd: "2026-08-31", statementOpening: 0, statementClosing: 0, status: "signed_off",
      lines: [], submittedBy: "Sophea Chan", submittedAt: ts("2026-09-04", 16), reviewedBy: "Sophea Chan", reviewedAt: ts("2026-09-04", 16, 20), reviewNote: "All lines matched.",
      history: [{ at: ts("2026-09-03", 10), by: "Sophea Chan", action: "Started reconciliation" }, { at: ts("2026-09-04", 16), by: "Sophea Chan", action: "Submitted for review" }, { at: ts("2026-09-04", 16, 20), by: "Sophea Chan", action: "Signed off" }],
    },
    {
      id: "rec_002", accountId: "acc_aba_usd", branchId: BRANCH_IDS.main, periodStart: "2026-09-01", periodEnd: "2026-09-30", statementOpening: sepOpen, statementClosing: 0, status: "in_progress", lines: sepLines,
      history: [{ at: ts("2026-10-02", 9), by: "Sophea Chan", action: "Started reconciliation from ABA_4821_Sep2026.csv" }],
    },
  ];
  const acledaSep = transactions.filter((t) => t.date >= "2026-09-01" && t.date <= "2026-09-30" && (t.accountId === "acc_acleda_usd" || t.toAccountId === "acc_acleda_usd"));
  reconciliations.push({
    id: "rec_003", accountId: "acc_acleda_usd", branchId: BRANCH_IDS.tk, periodStart: "2026-09-01", periodEnd: "2026-09-30", statementOpening: 0, statementClosing: 0, status: "submitted",
    lines: acledaSep.map((t) => ({ id: id("rl"), date: t.date, description: t.description.toUpperCase().slice(0, 40), amount: signedFor(t, "acc_acleda_usd"), reference: t.reference, state: "matched" as const, transactionId: t.id, matchConfidence: 1 })),
    submittedBy: "Dara Kim", submittedAt: ts("2026-10-06", 17, 45),
    history: [{ at: ts("2026-10-05", 9), by: "Dara Kim", action: "Started reconciliation" }, { at: ts("2026-10-06", 17, 45), by: "Dara Kim", action: "Submitted for owner sign-off", note: "All 37 lines matched." }],
  });
  for (const r of reconciliations) {
    if (r.status === "signed_off" || r.status === "submitted") {
      for (const t of transactions) if ((t.accountId === r.accountId || t.toAccountId === r.accountId) && t.date >= r.periodStart && t.date <= r.periodEnd) t.reconciled = true;
    }
  }

  /* ---------------- Till sessions ---------------- */

  const tillSessions: TillSession[] = [];
  const denomsFor = (usdAmt: number, khrAmt: number): TillDenomination[] => {
    const out: TillDenomination[] = [];
    let rem = Math.round(usdAmt * 100) / 100;
    for (const v of [100, 50, 20, 10, 5, 1]) {
      const c = Math.floor(rem / v);
      if (c) out.push({ currency: "USD", value: v, count: c });
      rem = Math.round((rem - c * v) * 100) / 100;
    }
    let remK = khrAmt;
    for (const v of [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 100]) {
      const c = Math.floor(remK / v);
      if (c) out.push({ currency: "KHR", value: v, count: c });
      remK -= c * v;
    }
    return out;
  };
  const tillDays = days.slice(-7, -1); // Oct 5 – Oct 10
  for (const b of [BRANCH_IDS.main, BRANCH_IDS.tk, BRANCH_IDS.sr]) {
    for (const d of tillDays) {
      const floatUSD = FLOAT[branchAccounts[b].cash];
      const floatKHR = b === BRANCH_IDS.main ? 400_000 : 0;
      const expectedUSD = usd(floatUSD + (dailyCashUSD[`${b}|${d}`] ?? 0));
      const expectedKHR = floatKHR + (dailyCashKHR[`${b}|${d}`] ?? 0);
      let countedUSD = expectedUSD;
      let countedKHR = expectedKHR;
      let status: TillSession["status"] = "signed_off";
      let reviewNote: string | undefined;
      if (b === BRANCH_IDS.tk && d === "2026-10-10") { countedUSD = usd(expectedUSD - 4.5); status = "submitted"; }
      if (b === BRANCH_IDS.main && d === "2026-10-10") { countedKHR = expectedKHR - 12_000; status = "submitted"; }
      if (b === BRANCH_IDS.sr && d === "2026-10-09") { countedUSD = usd(expectedUSD + 12); status = "returned"; reviewNote = "Over by $12.00 — please recount the $1 notes and check for an unrecorded sale."; }
      if (b === BRANCH_IDS.sr && d === "2026-10-07") { countedUSD = usd(expectedUSD - 1.25); }
      const by = managerName[b];
      const s: TillSession = {
        id: `till_${b.slice(3)}_${d.replace(/-/g, "")}`,
        branchId: b, date: d, shift: "full_day", openingFloatUSD: floatUSD, openingFloatKHR: floatKHR, expectedUSD, expectedKHR, countedUSD, countedKHR,
        denominations: denomsFor(countedUSD, countedKHR), status, submittedBy: by, submittedAt: ts(d, 21, 10),
        reviewedBy: status === "signed_off" || status === "returned" ? "Sophea Chan" : undefined,
        reviewedAt: status === "signed_off" || status === "returned" ? ts(addDaysISO(d, 1), 8, 30) : undefined,
        reviewNote,
        history: [{ at: ts(d, 21, 10), by, action: "Submitted count" }],
      };
      if (s.reviewedAt) s.history.push({ at: s.reviewedAt, by: "Sophea Chan", action: status === "returned" ? "Returned for correction" : "Signed off", note: reviewNote });
      tillSessions.push(s);
    }
  }
  tillSessions.sort((a, b) => b.date.localeCompare(a.date));

  /* ---------------- Notifications ---------------- */

  const notifications: AppNotification[] = [
    { id: "ntf_001", category: "financial", severity: "error", title: "Invoice INV-2026-0015 is overdue", body: "Sovann Mini Mart has not paid INV-2026-0015 (due 16 Sep 2026).", createdAt: ts("2026-09-17", 8), read: false, href: "/invoices/inv_015", key: "overdue:inv_015" },
    { id: "ntf_002", category: "financial", severity: "warning", title: "8 imported transactions need review", body: "ABA_4821_01-09Oct2026.csv has transactions with AI category suggestions awaiting confirmation.", createdAt: ts("2026-10-10", 9, 4), read: false, href: "/banking/uncategorized", key: "import:imp_005" },
    { id: "ntf_003", category: "financial", severity: "warning", title: "Low stock: Roasted Cashew Nuts 250g", body: "Siem Reap – Wat Bo is out of stock (0 packs).", createdAt: ts("2026-10-09", 17), read: false, href: "/items/itm_snk002", branchId: BRANCH_IDS.sr, key: "lowstock:itm_snk002:br_sr" },
    { id: "ntf_004", category: "financial", severity: "info", title: "Till count submitted – Toul Kork", body: "Dara Kim submitted the 10 Oct till count (short $4.50). Awaiting your sign-off.", createdAt: ts("2026-10-10", 21, 10), read: false, href: "/till-balancing/till_tk_20261010", branchId: BRANCH_IDS.tk },
    { id: "ntf_005", category: "financial", severity: "info", title: "Reconciliation submitted – ACLEDA Current USD", body: "September reconciliation for ACLEDA •••• 1094 is ready for owner sign-off.", createdAt: ts("2026-10-06", 17, 45), read: false, href: "/reconciliation/rec_003", branchId: BRANCH_IDS.tk },
    { id: "ntf_006", category: "system", severity: "error", title: "Telegram bot disconnected", body: "The Telegram bot token was revoked. Reconnect to keep sending invoice reminders.", createdAt: ts("2026-10-08", 7, 55), read: false, href: "/integrations/telegram" },
    { id: "ntf_007", category: "system", severity: "success", title: "Shopify sync completed", body: "42 online orders imported as sales for Main Branch – BKK1.", createdAt: ts("2026-10-11", 6, 0), read: true, href: "/integrations/shopify" },
    { id: "ntf_008", category: "financial", severity: "warning", title: "Bill due soon: Orussey Wholesale Market", body: "BILL-2026-0009 ($1,320.00) is due on 15 Oct 2026.", createdAt: ts("2026-10-08", 8), read: true, href: "/bills/bill_009" },
    { id: "ntf_009", category: "system", severity: "info", title: "Branch manager invitation sent", body: "Sreymom Ly was invited to manage Sen Sok.", createdAt: ts("2026-10-08", 14, 20), read: true, href: "/branch-managers" },
    { id: "ntf_010", category: "system", severity: "success", title: "September report generated", body: "Your September 2026 report is ready, but it is incomplete until the ABA reconciliation is signed off.", createdAt: ts("2026-10-02", 7), read: true, href: "/reports/rep_2026-09" },
    { id: "ntf_011", category: "system", severity: "error", title: "Statement import failed", body: "ACLEDA_1094_Sep_scan.pdf could not be read. Export the statement as CSV or Excel.", createdAt: ts("2026-10-04", 15, 23), read: true, href: "/banking/import-history", branchId: BRANCH_IDS.tk },
  ];

  const notificationPreferences: NotificationPreferences = {
    channels: { inApp: true, email: true, telegram: false },
    events: { overdue_invoices: true, upcoming_bills: true, low_stock: true, import_review: true, reconciliation: true, till: true, reports: true, system: true },
    digest: "daily",
  };

  /* ---------------- Integrations ---------------- */

  const integrations: Integration[] = [
    {
      id: "shopify", name: "Shopify", description: "Import online store orders as sales and keep item stock in sync.", status: "connected", connectedAt: ts("2026-03-12", 10), lastSyncAt: ts("2026-10-11", 6),
      config: { storeUrl: "angkorfresh.myshopify.com", branchId: BRANCH_IDS.main, syncOrders: true, syncInventory: true, schedule: "every_6_hours" },
      history: [
        { id: "sync_s1", startedAt: ts("2026-10-11", 6), finishedAt: ts("2026-10-11", 6, 1), status: "success", recordsProcessed: 42, message: "42 orders imported, 0 skipped" },
        { id: "sync_s2", startedAt: ts("2026-10-11", 0), finishedAt: ts("2026-10-11", 0, 1), status: "success", recordsProcessed: 7, message: "7 orders imported" },
        { id: "sync_s3", startedAt: ts("2026-10-10", 18), finishedAt: ts("2026-10-10", 18, 2), status: "failed", recordsProcessed: 0, message: "Shopify API rate limit reached; retried automatically" },
        { id: "sync_s4", startedAt: ts("2026-10-10", 12), finishedAt: ts("2026-10-10", 12, 1), status: "success", recordsProcessed: 15, message: "15 orders imported" },
      ],
    },
    { id: "webill365", name: "WeBill365", description: "Send e-invoices and receive supplier bills through the WeBill365 network.", status: "disconnected", config: { companyId: "", autoSendInvoices: false }, history: [] },
    {
      id: "telegram", name: "Telegram", description: "Send invoices, payment reminders and daily summaries through a Telegram bot.", status: "error", connectedAt: ts("2026-05-02", 9), lastSyncAt: ts("2026-10-07", 20),
      errorMessage: "Bot token rejected (401 Unauthorized). The token may have been revoked in BotFather.",
      config: { botUsername: "@AngkorFreshBot", dailySummary: true, invoiceReminders: true, chatId: "-1002231457" },
      history: [
        { id: "sync_t1", startedAt: ts("2026-10-08", 7, 55), finishedAt: ts("2026-10-08", 7, 55), status: "failed", recordsProcessed: 0, message: "401 Unauthorized – bot token rejected" },
        { id: "sync_t2", startedAt: ts("2026-10-07", 20), finishedAt: ts("2026-10-07", 20), status: "success", recordsProcessed: 3, message: "Daily summary sent to 3 chats" },
      ],
    },
  ];

  /* ---------------- Reports, advisor, forecasting ---------------- */

  const reports: MonthlyReport[] = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => ({
    id: `rep_${m}`,
    month: m,
    status: m === "2026-09" ? "incomplete" : "complete",
    generatedAt: ts(addDaysISO(`${m}-01`, 32).slice(0, 8) + "02", 7),
    missing: m === "2026-09" ? ["ABA Business USD reconciliation for September is not signed off", "ACLEDA Current USD reconciliation awaits owner sign-off"] : [],
    branchScope: "all",
  }));

  // Conversations start empty; the advisor builds answers from live store data.
  const conversations: AdvisorConversation[] = [];

  return {
    business,
    users,
    branches,
    managers,
    categories,
    accounts,
    transactions,
    customers,
    invoices,
    plannedPurchases,
    bills,
    items,
    stockMovements,
    stockAdjustments,
    sales,
    imports,
    reconciliations,
    tillSessions,
    notifications,
    notificationPreferences,
    integrations,
    reports,
    conversations,
    scenarios: [],
    targetBudgets: [],
  };
}
