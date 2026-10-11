/**
 * Simulated "AI" categorization for imported bank lines.
 *
 * Deterministic keyword rules stand in for the FastAPI categorization model:
 * the same description always yields the same suggestion and confidence, so
 * demo runs are reproducible. Suggestions are never posted without review.
 */
import type { ID } from "@/types";

export interface CategorySuggestion {
  categoryId: ID;
  confidence: number; // 0-1
  /** Short human-readable reason shown in the review table. */
  reason: string;
}

export const LOW_CONFIDENCE = 0.7;

interface Rule {
  test: RegExp;
  dir: "in" | "out" | "any";
  categoryId: ID;
  confidence: number;
  reason: string;
}

/** Suppliers we buy stock from (matches seeded bills and purchases). */
export const KNOWN_SUPPLIERS = [
  "MEKONG BEVERAGE",
  "GOLDEN HARVEST",
  "BATTAMBANG RICE",
  "KAMPOT SPICE",
  "ORUSSEY",
  "ANGKOR ICE",
  "PHNOM PENH PACKAGING",
];

const RULES: Rule[] = [
  { test: /KHQR SETTLEMENT|MERCHANT SETTLEMENT|POS SETTLEMENT|QR SETTLEMENT/, dir: "in", categoryId: "cat_sales", confidence: 0.95, reason: "Card/QR settlement from POS" },
  { test: /INTEREST/, dir: "in", categoryId: "cat_other_income", confidence: 0.94, reason: "Bank interest credit" },
  { test: /REBATE|REFUND|CASHBACK/, dir: "in", categoryId: "cat_other_income", confidence: 0.8, reason: "Rebate or refund" },
  { test: /SERVICE CHARGE|\bFEES?\b|COMMISSION|ANNUAL CARD/, dir: "out", categoryId: "cat_fees", confidence: 0.97, reason: "Bank or wallet fee" },
  { test: /SALARY|PAYROLL|WAGES/, dir: "out", categoryId: "cat_salaries", confidence: 0.93, reason: "Payroll keyword" },
  { test: /\bEDC\b|ELECTRIC|WATER SUPPLY|PPWSA|INTERNET|FIBRE/, dir: "out", categoryId: "cat_utilities", confidence: 0.92, reason: "Utility provider" },
  { test: /TOP ?UP|SMART AXIATA|CELLCARD|METFONE/, dir: "out", categoryId: "cat_utilities", confidence: 0.72, reason: "Mobile top-up" },
  { test: /FUEL|TELA|\bPTT\b|CALTEX|TOTAL ?ENERGIES/, dir: "out", categoryId: "cat_transport", confidence: 0.91, reason: "Fuel station" },
  { test: /GRAB|PASSAPP|TADA|DELIVERY|EXPRESS/, dir: "out", categoryId: "cat_transport", confidence: 0.88, reason: "Ride-hailing or delivery" },
  { test: new RegExp(KNOWN_SUPPLIERS.join("|")), dir: "out", categoryId: "cat_cogs", confidence: 0.89, reason: "Known stock supplier" },
  { test: /RESTOCK/, dir: "out", categoryId: "cat_cogs", confidence: 0.84, reason: "Restock purchase" },
  { test: /\bRENT\b/, dir: "out", categoryId: "cat_rent", confidence: 0.9, reason: "Rent payment" },
  { test: /FACEBK|FACEBOOK|\bMETA\b|GOOGLE ADS|TELEGRAM ADS/, dir: "out", categoryId: "cat_marketing", confidence: 0.84, reason: "Advertising platform" },
  { test: /PRINT HOUSE|PRINTING/, dir: "out", categoryId: "cat_marketing", confidence: 0.71, reason: "Printing (likely marketing)" },
  { test: /\bTAX\b|\bGDT\b/, dir: "out", categoryId: "cat_tax", confidence: 0.86, reason: "Tax authority" },
  { test: /SUPERMARKET|SUPPLIES|PHSAR/, dir: "out", categoryId: "cat_supplies", confidence: 0.63, reason: "Retail purchase (could be supplies or stock)" },
  { test: /REPAIR|SERVICES|MAINTENANCE/, dir: "out", categoryId: "cat_maintenance", confidence: 0.66, reason: "Service provider" },
];

/**
 * Suggest a category for a statement line.
 * @param customers customer names (upper-cased match) — transfers from a customer are wholesale receipts.
 */
export function suggestCategory(description: string, signedAmount: number, customers: string[] = []): CategorySuggestion | undefined {
  const d = description.toUpperCase();
  const dir = signedAmount >= 0 ? "in" : "out";
  if (dir === "in") {
    const cust = customers.find((c) => c.length > 3 && d.includes(c.toUpperCase()));
    if (cust) return { categoryId: "cat_wholesale", confidence: 0.86, reason: `Transfer from customer ${cust}` };
  }
  for (const r of RULES) {
    if ((r.dir === "any" || r.dir === dir) && r.test.test(d)) return { categoryId: r.categoryId, confidence: r.confidence, reason: r.reason };
  }
  if (dir === "in" && /TRF FROM|TRANSFER FROM|CASH IN/.test(d)) return { categoryId: "cat_wholesale", confidence: 0.52, reason: "Incoming transfer from an unknown payer" };
  return undefined;
}

/** Item-category suggestion for catalog imports, by product keywords. */
export function suggestItemCategory(name: string): CategorySuggestion | undefined {
  const n = name.toUpperCase();
  const rules: [RegExp, ID, number][] = [
    [/BEER|WATER|SODA|JUICE|COLA|DRINK|TEA BOTTLE|ENERGY/, "icat_bev", 0.92],
    [/COFFEE|TEA/, "icat_coffee", 0.88],
    [/RICE|GRAIN|FLOUR|NOODLE/, "icat_rice", 0.8],
    [/PEPPER|SALT|SUGAR|SAUCE|SPICE|MSG|CHILLI/, "icat_spice", 0.9],
    [/SNACK|CHIP|CRACKER|CASHEW|MANGO|COOKIE|BISCUIT/, "icat_snacks", 0.86],
    [/DETERGENT|SOAP|TISSUE|OIL|DISH|SHAMPOO|BLEACH/, "icat_household", 0.82],
    [/EGG|LIME|VEGETABLE|FRUIT|BANANA/, "icat_fresh", 0.84],
  ];
  for (const [re, id, c] of rules) if (re.test(n)) return { categoryId: id, confidence: c, reason: "Product keyword" };
  return undefined;
}
