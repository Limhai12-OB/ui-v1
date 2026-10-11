# LedgerVision

AI-powered financial management for small and medium retail businesses in Cambodia. This
repository is the **frontend demonstration**: a full Next.js application running against a
deterministic mock backend, with an API layer ready for the Spring Boot core services and the
FastAPI AI services.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Sign in with a demo account. In the demo, any password of 8+ characters is accepted:

| Role | Email | Scope |
|---|---|---|
| Business Owner | `sophea.chan@angkorfresh.demo` | All branches, forecasting, branch & manager management, sign-offs |
| Branch Manager | `dara.kim@angkorfresh.demo` | Toul Kork branch only |

You can switch roles at any time from the avatar menu → **Demo role**. To restore the original
sample data, go to **Settings → Demo & data → Reset demo data**.

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Functional tests for the connected workflows (Vitest) |

## Demo dataset

**Angkor Fresh Mart Co., Ltd.** is a fictional mini-mart chain with four branches (Main Branch –
BKK1, Toul Kork, Siem Reap – Wat Bo, and Sen Sok, which opened on 1 Oct 2026). The data covers
about six months (April to October 2026). It is generated from a seeded PRNG
(`src/data/mock/seed.ts`), so every install shows the same numbers. The business clock is fixed at
**11 October 2026** (`src/lib/date.ts`), which keeps overdue states and forecasts reproducible.

The data includes a few deliberate situations to explore:

- From September, a beverage supplier raised prices. Expenses go up and the AI Advisor explains why.
- Some invoices are overdue, some bills are due soon, and some items are low or out of stock.
- One reconciliation is in progress and another is waiting for owner sign-off.
- One bank-statement import has 8 transactions that need categorization.
- One ACLEDA import failed, and the Telegram integration is in an error state.
- Sen Sok has less than 30 days of sales, so Forecasting shows an "insufficient history" state for it.

## Architecture

```
src/
  app/(auth)/            Sign-in, sign-up, verification, reset, business setup, invitations
  app/(dashboard)/       Authenticated routes (shell: sidebar, top bar, role route guard)
  components/ui/         shadcn/ui primitives (tuned to the design tokens)
  components/layout/     App shell, sidebar, top bar, breadcrumbs, global search (⌘K)
  components/shared/     PageHeader, StatusBadge, Money, StatCard, states, dialogs, Steps…
  components/forms/      Field, MoneyInput, entity selects
  components/tables/     DataTable (TanStack Table)
  components/charts/     Chart conventions and tooltip/legend (Recharts)
  features/<domain>/     Feature modules (one folder per product area)
  lib/api/               API layer: config (mock|live), HTTP clients, domain services
  lib/analytics.ts       Every KPI, series and breakdown (shared by dashboard/reports/AI/forecast)
  lib/domain/            Derived values: totals, statuses, balances, stock levels, numbering
  lib/currency/          USD/KHR formatting and explicit-rate conversion
  lib/permissions/       Role permissions and route rules
  lib/i18n/              English/Khmer dictionaries
  store/                 Zustand stores: app data (persisted), session, UI preferences
  data/mock/             Deterministic seed dataset
  types/                 Domain types (mirror the backend contracts)
```

See [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) for patterns, components, and the route map.

### Data flow

```
Component ──reads──▶ useAppStore selectors + useScope()   (role/branch scope, display currency)
    │
    └─mutates─▶ useAction(service.fn) ─▶ lib/api/services/*
                                           ├─ mock: simulate(latency) → store action → every view updates
                                           └─ live: coreApi / aiApi fetch → Spring Boot / FastAPI
```

### Connecting the backend

Set these environment variables:

```bash
NEXT_PUBLIC_API_MODE=live
NEXT_PUBLIC_CORE_API_URL=https://api.example.com/api/v1   # Spring Boot
NEXT_PUBLIC_AI_API_URL=https://ai.example.com/ai/v1       # FastAPI
```

Services already declare the endpoints they will call. When you connect the backend, also replace
`today()` with the real date and replace the persisted mock store with query caching.

## Product rules implemented

- **Currency.** Every record keeps its own currency. Amounts are converted only when a USD→KHR rate
  has been configured. Converted totals are marked with "≈" and show the rate. If the rate is
  removed, amounts are shown separately and never added together.
- **Roles.** Branch Managers see only their assigned branch. They cannot switch branches, manage
  branches or managers, see forecasting, or sign off reconciliations and till counts. The frontend
  only hides these actions; **the backend must enforce authorization.**
- **Honest mocks.** The AI Advisor is read-only and answers from the same data shown elsewhere in
  the app. OCR, voice recording, Google sign-in, email and integrations are clearly labelled as
  simulated. Uploaded files are never posted without a review step and an explicit confirmation.
- **Accessibility.** Pages use semantic landmarks and include a skip link. Every control is
  labelled, focus is always visible, statuses use an icon and text (never color alone), and
  reduced-motion settings are respected.
# ui-v1
