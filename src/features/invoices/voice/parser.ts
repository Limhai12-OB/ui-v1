/**
 * Simulated AI extraction for Voice-to-Invoice.
 *
 * A deterministic, local rule-based parser — NOT a model. It matches customer
 * names and item names/aliases (English + Khmer from `item.nameKm`), reads
 * quantities from digits, Khmer digits or number words, and a due-in-N-days
 * phrase. Confidence values are heuristics so the review UI can highlight
 * what needs checking. Replace with the FastAPI extraction service later.
 */
import type { Customer, Item, Language } from "@/types";

export interface ExtractedLine {
  itemId: string;
  phrase: string;
  quantity?: number;
  /** 0–1 heuristic confidence for the item match. */
  itemConfidence: number;
  /** 0–1 heuristic confidence for the quantity. */
  quantityConfidence: number;
}

export type ExtractionWarning =
  | { kind: "customer_not_found"; phrase?: string }
  | { kind: "unknown_item"; phrase: string }
  | { kind: "missing_quantity"; itemId: string; phrase: string };

export interface Extraction {
  customerId?: string;
  customerConfidence: number;
  customerPhrase?: string;
  dueInDays?: number;
  lines: ExtractedLine[];
  warnings: ExtractionWarning[];
  /** Mean confidence across all extracted fields. */
  overall: number;
}

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const toAsciiDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));

const EN_UNITS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, dozen: 12,
};
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** Khmer number words, longest first so ប្រាំពីរ wins over ប្រាំ. */
const KM_WORDS: [string, number][] = [
  ["ប្រាំបួន", 9], ["ប្រាំបី", 8], ["ប្រាំពីរ", 7], ["ប្រាំមួយ", 6], ["សាមសិប", 30], ["ម្ភៃ", 20], ["ដប់", 10], ["ប្រាំ", 5], ["បួន", 4], ["បី", 3], ["ពីរ", 2], ["មួយ", 1],
];

/** Hand-maintained aliases by SKU; every item also gets aliases from its own names. */
const ALIASES: Record<string, string[]> = {
  "BEV-001": ["lager beer", "lager", "beer cans", "beer", "ស្រាបៀរ", "ស្រាបៀរកំប៉ុង"],
  "BEV-002": ["draft beer", "draught beer", "ស្រាបៀរស្រស់"],
  "BEV-003": ["drinking water", "bottled water", "water", "ទឹកសុទ្ធ"],
  "BEV-004": ["coconut water", "ទឹកដូង"],
  "BEV-005": ["green tea", "តែបៃតង"],
  "BEV-006": ["iced coffee", "កាហ្វេទឹកកក"],
  "RIC-001": ["phka rumduol rice", "phka rumduol", "jasmine rice", "អង្ករផ្ការំដួល"],
  "RIC-002": ["phka malis rice", "phka malis", "អង្ករផ្កាម្លិះ"],
  "SPC-001": ["kampot black pepper", "kampot pepper", "black pepper", "pepper", "ម្រេចកំពត", "ម្រេច"],
  "SPC-002": ["palm sugar", "ស្ករត្នោត"],
  "SPC-003": ["fish sauce", "ទឹកត្រី"],
  "SPC-004": ["sea salt", "salt", "អំបិលកំពត", "អំបិល"],
  "SNK-001": ["dried mango", "ស្វាយក្រៀម"],
  "SNK-002": ["cashew nuts", "cashews", "cashew", "គ្រាប់ស្វាយចន្ទី"],
  "SNK-003": ["instant noodles", "noodles", "មីកញ្ចប់"],
  "SNK-004": ["rice crackers", "នំអង្ករ"],
  "COF-001": ["mondulkiri coffee", "arabica coffee", "coffee beans", "កាហ្វេមណ្ឌលគិរី"],
  "COF-002": ["jasmine tea", "តែផ្កាម្លិះ"],
  "HOU-001": ["laundry detergent", "detergent", "washing powder", "ម្សៅសាប៊ូ"],
  "HOU-002": ["dishwashing liquid", "dish soap", "ទឹកលាងចាន"],
  "HOU-003": ["toilet tissue", "toilet paper", "tissue", "ក្រដាសអនាម័យ"],
  "HOU-004": ["cooking oil", "soybean oil", "ប្រេងឆា"],
  "FRE-001": ["eggs", "egg trays", "ពងមាន់"],
  "FRE-002": ["limes", "lime", "ក្រូចឆ្មារ"],
};

const isKhmer = (s: string) => /[ក-៿]/.test(s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Alias {
  itemId: string;
  text: string;
  /** Exact product name vs short alias. */
  exact: boolean;
}

function buildAliases(items: Item[]): Alias[] {
  const out: Alias[] = [];
  const seen = new Set<string>();
  const add = (itemId: string, text: string, exact: boolean) => {
    const t = text.trim().toLowerCase();
    if (t.length < 3 || seen.has(t)) return;
    seen.add(t);
    out.push({ itemId, text: t, exact });
  };
  for (const it of items) {
    if (it.status !== "active") continue;
    add(it.id, it.name, true);
    add(it.id, it.name.replace(/\(.*?\)/g, "").replace(/\b\d+(\.\d+)?\s?(ml|l|kg|g)\b/gi, ""), true);
    if (it.nameKm) {
      add(it.id, it.nameKm, true);
      add(it.id, it.nameKm.split(/\s/)[0], true);
    }
    for (const a of ALIASES[it.sku] ?? []) add(it.id, a, false);
  }
  // Longest first so "coconut water" beats "water" and ស្រាបៀរស្រស់ beats ស្រាបៀរ.
  return out.sort((a, b) => b.text.length - a.text.length);
}

interface Match {
  start: number;
  end: number;
  alias: Alias;
}

function findMatches(text: string, aliases: Alias[]): Match[] {
  const lower = text.toLowerCase();
  const taken: boolean[] = new Array(lower.length).fill(false);
  const matches: Match[] = [];
  for (const alias of aliases) {
    const re = isKhmer(alias.text) ? new RegExp(escapeRe(alias.text), "g") : new RegExp(`\\b${escapeRe(alias.text)}s?\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.slice(start, end).some(Boolean)) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      matches.push({ start, end, alias });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

/** First quantity in a fragment: digits (incl. Khmer digits) or number words. */
function readQuantity(fragment: string): { value: number; confidence: number } | undefined {
  const ascii = toAsciiDigits(fragment);
  const digit = /(\d+(?:\.\d+)?)/.exec(ascii);
  const lower = ascii.toLowerCase();
  const words = lower.match(/[a-z]+/g) ?? [];
  let wordValue: { value: number; index: number } | undefined;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in EN_TENS) {
      const next = words[i + 1];
      const unit = next && next in EN_UNITS && EN_UNITS[next] < 10 ? EN_UNITS[next] : 0;
      wordValue = { value: EN_TENS[w] + unit, index: lower.indexOf(w) };
      break;
    }
    if (w in EN_UNITS && !(w === "a" || w === "an")) {
      wordValue = { value: EN_UNITS[w], index: lower.indexOf(w) };
      break;
    }
  }
  let kmValue: { value: number; index: number } | undefined;
  for (const [w, v] of KM_WORDS) {
    const idx = fragment.indexOf(w);
    if (idx >= 0 && (!kmValue || idx < kmValue.index)) kmValue = { value: v, index: idx };
  }
  const candidates = [
    digit ? { value: Number(digit[1]), index: digit.index, confidence: 0.96 } : undefined,
    wordValue ? { ...wordValue, confidence: 0.9 } : undefined,
    kmValue ? { ...kmValue, confidence: 0.85 } : undefined,
  ].filter(Boolean) as { value: number; index: number; confidence: number }[];
  if (!candidates.length) return undefined;
  const best = candidates.sort((a, b) => a.index - b.index)[0];
  return best.value > 0 ? { value: best.value, confidence: best.confidence } : undefined;
}

function findCustomer(text: string, customers: Customer[]): { customer?: Customer; confidence: number; phrase?: string } {
  const lower = text.toLowerCase();
  const full = customers.filter((c) => lower.includes(c.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (full) return { customer: full, confidence: 0.97, phrase: full.name };
  const en = /invoice (?:for|to)\s+([^,:.;]+?)(?=[,:.;]|\s+(?:with|for)\s|$)/i.exec(text);
  const km = /វិក្កយបត្រ(?:សម្រាប់|ជូន)\s*([A-Za-z0-9&'.\- ]+?|[\u1780-\u17FF]+?)(?=\s[\u1780-\u17FF]|,|$)/.exec(text);
  const intro = (en?.[1] ?? km?.[1])?.trim();
  // Partial: a distinctive word of a customer name (e.g. "Riverside") inside the
  // "invoice for …" phrase only, so item words like "Kampot pepper" don't match.
  if (intro) {
    const introLower = intro.toLowerCase();
    for (const c of customers) {
      const word = c.name.split(/\s+/).find((w) => w.length >= 5 && !/restaurant|guesthouse|house|shop|mart|street/i.test(w));
      if (word && new RegExp(`\\b${escapeRe(word.toLowerCase())}\\b`).test(introLower)) return { customer: c, confidence: 0.72, phrase: intro };
    }
  }
  return { confidence: 0, phrase: intro };
}

const DUE_PATTERNS: RegExp[] = [
  /\b(?:due|payable|pay)\s+(?:in|within)\s+([a-z0-9 -]+?)\s+days?\b/i,
  /\bnet\s+(\d+)\b/i,
  /(?:ត្រូវបង់|ផុតកំណត់|បង់)[^\d]{0,24}(\d+)\s*ថ្ងៃ/,
  /ក្នុង(?:រយៈពេល)?\s*(\d+)\s*ថ្ងៃ/,
];

/** Remove the customer intro and due-date phrase so they aren't read as items. */
function stripMeta(text: string, customerPhrase?: string): { rest: string; dueInDays?: number } {
  let rest = toAsciiDigits(text);
  let dueInDays: number | undefined;
  for (const re of DUE_PATTERNS) {
    const m = re.exec(rest);
    if (m) {
      const q = readQuantity(m[1]);
      if (q) dueInDays = Math.round(q.value);
      rest = rest.replace(m[0], " ");
      break;
    }
  }
  if (customerPhrase) rest = rest.replace(new RegExp(escapeRe(customerPhrase), "i"), " ");
  rest = rest.replace(/\binvoice (?:for|to)\b/gi, " ").replace(/វិក្កយបត្រ(?:សម្រាប់|ជូន)?/g, " ");
  return { rest, dueInDays };
}

const FILLER = /\b(of|and|also|plus|please|some|the|cases?|bags?|bottles?|packs?|boxes?|cans?|trays?|kg|units?|pcs|pieces?|with|for|to|due|days?)\b/gi;
const KM_FILLER = /(កេស|បាវ|ដប|កញ្ចប់|កំប៉ុង|ថាស|គីឡូ|និង|ហើយ|ផង|សម្រាប់)/g;

export function extractInvoice(transcript: string, customers: Customer[], items: Item[], language: Language): Extraction {
  const warnings: ExtractionWarning[] = [];
  const cust = findCustomer(transcript, customers);
  if (!cust.customer) warnings.push({ kind: "customer_not_found", phrase: cust.phrase });

  const { rest, dueInDays } = stripMeta(transcript, cust.phrase);
  const aliases = buildAliases(items);
  const lines: ExtractedLine[] = [];

  // Clauses: commas, semicolons, colons, line breaks, "and", "និង".
  const clauses = rest.split(/[,;:\n]|\s+and\s+|\s+then\s+|និង|ហើយ/i).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const matches = findMatches(clause, aliases);
    if (matches.length === 0) {
      const leftover = clause.replace(FILLER, " ").replace(KM_FILLER, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
      const meaningful = leftover.replace(/\d+/g, "").trim();
      if (meaningful.length >= 3 && readQuantity(clause)) warnings.push({ kind: "unknown_item", phrase: clause.replace(/\s+/g, " ").trim() });
      else if (meaningful.length >= 4 && !/^(invoice|please|thanks?|thank you)$/i.test(meaningful)) warnings.push({ kind: "unknown_item", phrase: clause.replace(/\s+/g, " ").trim() });
      continue;
    }
    // Each match owns a fragment: English quantities come before the item
    // ("ten cases of beer"), Khmer quantities follow it ("ស្រាបៀរ ៨ កេស").
    matches.forEach((m, i) => {
      const quantityAfter = language === "km" || isKhmer(m.alias.text);
      const fragment = quantityAfter
        ? clause.slice(m.end, matches[i + 1]?.start ?? clause.length)
        : clause.slice(i === 0 ? 0 : matches[i - 1].end, m.start);
      let q = readQuantity(fragment);
      // Fallback: the other side of the item, e.g. "beer 10 cases" in English.
      if (!q) q = readQuantity(quantityAfter ? clause.slice(i === 0 ? 0 : matches[i - 1].end, m.start) : clause.slice(m.end, matches[i + 1]?.start ?? clause.length));
      const phrase = clause.slice(m.start, m.end);
      const itemConfidence = m.alias.exact ? 0.97 : isKhmer(m.alias.text) ? 0.9 : m.alias.text.includes(" ") ? 0.88 : 0.74;
      if (!q) warnings.push({ kind: "missing_quantity", itemId: m.alias.itemId, phrase });
      const existing = lines.find((l) => l.itemId === m.alias.itemId);
      if (existing && q) {
        existing.quantity = (existing.quantity ?? 0) + q.value;
        return;
      }
      lines.push({ itemId: m.alias.itemId, phrase, quantity: q?.value, itemConfidence, quantityConfidence: q?.confidence ?? 0.3 });
    });
  }

  const scores = [cust.confidence, ...lines.flatMap((l) => [l.itemConfidence, l.quantityConfidence])];
  const overall = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
  return { customerId: cust.customer?.id, customerConfidence: cust.confidence, customerPhrase: cust.phrase, dueInDays, lines, warnings, overall };
}

export interface VoiceSample {
  id: string;
  language: Language;
  label: string;
  transcript: string;
  /** Simulated recording length in seconds. */
  seconds: number;
}

export const VOICE_SAMPLES: VoiceSample[] = [
  {
    id: "en-riverside",
    language: "en",
    label: "Riverside Bistro — beer & rice",
    transcript: "Invoice for Riverside Bistro: ten cases of lager beer, five bags of Phka Rumduol rice, due in fifteen days",
    seconds: 7,
  },
  {
    id: "en-paradise",
    language: "en",
    label: "Angkor Paradise — with issues to review",
    transcript: "Invoice for Angkor Paradise Guesthouse, twenty packs of drinking water, 12 bottles of fish sauce, three boxes of mango juice and some palm sugar, due in 30 days",
    seconds: 9,
  },
  {
    id: "en-unknown",
    language: "en",
    label: "Unknown customer",
    transcript: "Invoice for Sunrise Hotel, six trays of eggs and four bags of laundry detergent, due in seven days",
    seconds: 6,
  },
  {
    id: "km-golden",
    language: "km",
    label: "Golden Lotus — ស្រាបៀរ & ទឹកត្រី",
    transcript: "វិក្កយបត្រសម្រាប់ Golden Lotus Restaurant ស្រាបៀរ ៨ កេស ទឹកត្រី ២០ ដប",
    seconds: 6,
  },
  {
    id: "km-pubstreet",
    language: "km",
    label: "Pub Street — អង្ករ & ម្រេច",
    transcript: "វិក្កយបត្រសម្រាប់ Pub Street Bar & Grill អង្ករផ្ការំដួល ៣ បាវ ម្រេចកំពត ១០ កញ្ចប់ ត្រូវបង់ក្នុងរយៈពេល ១៤ ថ្ងៃ",
    seconds: 8,
  },
];
