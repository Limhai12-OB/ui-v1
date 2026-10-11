# LedgerVision Frontend Conventions

Read this before adding a feature. The reference implementation of every pattern
below is **`src/features/categories/`** (list page + dialog form + delete confirm).

## Stack
Next.js 15 App Router · TypeScript · Tailwind v4 · shadcn/ui (radix, in `src/components/ui`) ·
lucide-react · Recharts 3 · React Hook Form + Zod 4 · TanStack Table v8 · Zustand 5 (+immer) ·
date-fns 4 · sonner (toasts) · framer-motion (sparingly).

## Page pattern
```
src/app/(dashboard)/<route>/page.tsx      // Server Component: metadata + renders feature
src/features/<feature>/<name>-page.tsx    // "use client" feature component
src/features/<feature>/*.tsx              // feature-private components
```
`page.tsx` exports `metadata = { title }` and renders the feature component. For dynamic
routes, `page.tsx` receives `params: Promise<{ id: string }>` (Next 15) —
`const { id } = await params;` then `<XDetail id={id} />`.

The `(dashboard)` layout already provides auth redirect, sidebar, top bar, role route
guard and the page container (`max-w-[1440px]`, padding). Pages start with `<PageHeader/>`.

## Data
- **Reads:** `useAppStore((s) => s.invoices)` etc. Derive with `useMemo`.
- **Scope:** `const { scope, inScope, isOwner, branch, branches, money, user } = useScope()`.
  Every list must filter records with `inScope(record.branchId)`. Managers only ever see
  their branch. Owners see the branch chosen in the top-bar selector (or all).
- **Mutations:** always through services in `@/lib/api` (`invoiceService.create(...)`) wrapped in
  `useAction(fn, { success: "…" })` → gives `pending`, `fire`, `run`, toasts. Never call store
  actions directly from components for user-facing mutations; never show a success toast for
  something that did not change state.
- **Derived values** (statuses, totals, balances, low stock): `@/lib/domain`.
  e.g. `invoiceStatus(inv)`, `invoiceTotals(inv)`, `billStatus`, `accountBalance`, `stockLevel`.
- **Analytics** (KPIs, series, breakdowns, health): `@/lib/analytics` — dashboard, reports,
  advisor and forecasting MUST use these so numbers agree everywhere.
- **Dates:** business "today" is `today()` from `@/lib/date` (fixed demo clock 2026-10-11).
  Never use `new Date()` for business dates. Format with `formatDate`, `formatDateTime`, `formatMonth`.
- **Lookups:** `useLookups()` → `branchName(id)`, `accountName`, `categoryName`, `customerName`, `itemName`.
- **Permissions:** `useCan("branches.manage")`; route-level rules in `lib/permissions` are enforced by
  the shell. Hide actions the user cannot perform (don't just disable them).
- **Detail pages:** if the id is not found or out of scope, render
  `<EmptyState title="… not found" action={<Button asChild><Link href="/list">Back</Link></Button>}/>`.

## Currency rules (hard requirements)
- Each record carries its own currency. Format with `<Money amount currency />` or `formatMoney`.
- Never add USD and KHR amounts directly. For totals in the display currency use
  `@/lib/analytics` (returns `ConvertedSum`) and render with `<ConvertedMoney sum currency rate/>`;
  add `<ConversionNote …/>` under charts/tables that include converted values.
- Conversion only with the configured `business.khrPerUsd` (may be `null` → show amounts separately).
- Display currency: `useScope().money.display`; rate: `useScope().money.rate`.

## UI components (use these, don't re-invent)
| Need | Component |
|---|---|
| Page title/actions/back link | `PageHeader`, `SectionHeader` (`components/shared/page-header`) |
| Status | `StatusBadge status="overdue"` (icon + label; all statuses registered there) |
| Money | `Money`, `ConvertedMoney`, `ConversionNote` (`components/shared/money`) |
| KPI tile | `StatCard` (`components/shared/stat`) |
| Empty / error / loading | `EmptyState`, `ErrorState`, `TableSkeleton`, `ChartSkeleton`, `CardsSkeleton`, `PageSkeleton` |
| Confirm / destructive | `ConfirmDialog` (async `onConfirm`, shows spinner) |
| Wizard progress | `Steps` |
| Honest mock labelling | `DemoNotice` (variant `"demo"` or `"ai"`), `AIBadge` |
| Detail key/values | `DetailList` |
| Unsaved changes | `<UnsavedChangesGuard when={formState.isDirty && !saved} />` |
| Forms | `Field`, `FormSection`, `MoneyInput`, `BranchSelect`, `AccountSelect`, `CategorySelect`, `CustomerSelect`, `CurrencySelect` |
| Tables | `DataTable` + `SortHeader` (`components/tables/data-table`) — wrap in `<Card className="gap-0 py-0">` |
| Charts | `components/charts/chart-kit`: `SERIES`, `CATEGORICAL`, `GRID_PROPS`, `AXIS_PROPS`, `moneyTick`, `ChartTooltip`, `ChartLegend` |
| First-load skeleton | `const loading = useInitialLoad()` on list/dashboard pages |

`Badge` variants: `success | warning | error | info | neutral | ai | outline | secondary`.
`Button` variants: `default | outline | secondary | ghost | destructive (soft) | danger (solid) | link`;
sizes `xs | sm | default | lg | icon | icon-xs | icon-sm | icon-lg`.

## Styling
- Semantic tokens only (`bg-card`, `text-muted-foreground`, `bg-primary-light`, `text-success-text`,
  `bg-error-light`, `text-ai-text` …). No raw hex in components.
- Page title 24px semibold (PageHeader). Section 18px semibold. Card title 14–16px medium.
  Body 14px (`text-sm`). Supporting 12–13px (`text-xs`). KPI values `text-2xl font-semibold`.
- All numbers/money: `tabular-nums`. Right-align numeric table columns (`meta: { align: "right" }`).
- Cards: `<Card>` (12px radius, 1px border, no heavy shadow). Grid gaps `gap-4`/`gap-6`.
- Charts: green (`SERIES.income`) = income, blue (`SERIES.expenses`) = expenses; further categories
  use `CATEGORICAL` in order. One y-axis. 2px lines. Legend for ≥2 series. Always a tooltip.
  Red is reserved for losses/overdue/errors — never a chart series color.
- Never communicate status with color alone (icon + text).
- Responsive: grids collapse to 1 column on mobile; tables scroll horizontally inside their card.

## Mock / AI honesty
- AI features are simulated: label outputs with `AIBadge` / `DemoNotice variant="ai"`.
- Never pretend the microphone, OCR or a model ran if it didn't. Simulations must say "simulated".
- Never silently post financial records after an upload — always review + explicit confirm.

## Accessibility
Semantic HTML, every input has a `Field` label, icon-only buttons have `aria-label`,
focus rings preserved, keyboard-operable controls, `aria-live`/`role="status"` for async progress.
`prefers-reduced-motion` is handled globally.

## Route map
| Area | Routes |
|---|---|
| Auth | `/sign-in` `/sign-up` `/forgot-password` `/verify-email` `/reset-password` `/business-setup` `/accept-invitation` `/change-password` |
| Overview | `/dashboard` `/advisor` `/reports` `/reports/[id]` `/forecasting` |
| Banking | `/banking` `/banking/import` `/banking/import-history` `/banking/uncategorized` `/accounts` `/accounts/new` `/accounts/[id]` |
| Finance | `/transactions` `/transactions/new?type=income|expense|transfer` `/transactions/[id]` `/bills` `/bills/new` `/bills/[id]` `/reconciliation` `/reconciliation/new` `/reconciliation/[id]` `/till-balancing` `/till-balancing/new` `/till-balancing/[id]` |
| Sales | `/customers` `/customers/new` `/customers/[id]` `/invoices` `/invoices/new` `/invoices/voice` `/invoices/[id]` `/invoices/[id]/edit` `/planned-purchases` `/planned-purchases/new` `/planned-purchases/[id]` |
| Inventory | `/items` `/items/new` `/items/import` `/items/[id]` `/items/[id]/edit` `/item-sales` `/walk-in-sales` `/walk-in-sales/new` `/stock-adjustments` `/stock-adjustments/new` |
| Business | `/branches` `/branches/new` `/branches/[id]` `/branches/[id]/edit` `/branch-managers` `/branch-managers/invite` `/categories` `/import` `/integrations` `/integrations/[id]` |
| Account | `/notifications` `/notifications/preferences` `/settings` `/profile` |

Query params used for deep links: `/import?type=receipt|supplier_bill|payment_screenshot|item_catalog|spreadsheet`,
`/invoices/new?customer=<id>`, `/transactions/new?type=expense`, `/stock-adjustments/new?item=<id>`.
