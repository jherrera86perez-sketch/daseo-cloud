# Daseo Cloud

Multi-tenant SaaS ERP for small manufacturers and retailers in Latin America — sales, inventory with real costing, production (BOM), and multi-currency collections (CUP/USD/BRL). Spanish and Portuguese UI.

> Cloud rebuild of CubaOne ERP, a 26-module desktop ERP running a real detergent factory. Built for markets with slow connections: strict performance budget enforced in CI.

**Live:** https://daseo-cloud.vercel.app

## Features (Phase 1)

- **Auth & organizations** — Better Auth with the organization plugin: signup provisions the org (pipeline stages, settings), invite by shareable link, roles verified against the DB on every request, DB-backed rate limiting.
- **Customers** — CRUD, search, soft delete, contacts, interaction timeline (calls/WhatsApp/notes).
- **Inventory** — products with units and flags, append-only kardex with weighted-average cost (bigint arithmetic, half-up in exactly one place), negative stock impossible (`SELECT FOR UPDATE`), low-stock alerts.
- **Multi-currency sales** — server-computed totals, exchange rate fixed per document, gapless invoice numbering, confirm = stock deduction + numbering in one transaction, cancel = counter-movements, **cross-currency payments** (sell in USD, collect in CUP), idempotency keys (double-click can't duplicate).
- **Quotes & pipeline** — kanban-style board (mobile-first stage moves), quote→accept creates the sale and wins the linked deal atomically (quote id doubles as the sale's idempotency key).
- **Recipes (BOM) & production** — theoretical cost at current average; production orders consume real quantities (waste included) + labor + overhead and enter finished goods at true unit cost. A "golden test" asserts kardex value == sum of all cost components.
- **Dashboard** — monthly sales per currency and consolidated at historical fixed rates, pipeline funnel, accounts receivable with overdue flags, production count, low-stock alert.

## Stack

- **Next.js 16** (App Router, RSC) + TypeScript, **Tailwind CSS v4** + shadcn/ui (OKLCH tokens, light/dark)
- **PostgreSQL** (Neon, WebSocket driver for transactions) + **Drizzle ORM**, migrations in `drizzle/`
- **Better Auth** (organizations plugin) · **next-intl** (es default, pt)
- **Vitest + PGlite** (real Postgres in-memory for integration tests) · **Playwright** E2E · **Lighthouse CI**
- GitHub Actions CI → Vercel auto-deploy

## Architecture notes

- Business logic lives in `src/features/*/{queries,actions}.ts` — components stay dumb; a future public REST API reuses the same layer.
- Multi-tenant by organization: every table carries `org_id`; every query requires it; a dedicated isolation suite seeds two orgs and asserts zero leakage.
- Money = `bigint` cents + currency + rate fixed per document; inventory valuation always in the org's base currency; reports consolidate at historical rates, never current ones.
- Documents are immutable: they get cancelled with counter-movements, never deleted. Sequences use `SELECT FOR UPDATE` (no gaps, no collisions).

## Development

```bash
npm install
# .env.local: DATABASE_URL (Neon), BETTER_AUTH_SECRET
npm run db:migrate && npm run dev   # http://localhost:3000
```

| Script                               | Purpose                               |
| ------------------------------------ | ------------------------------------- |
| `npm test`                           | Unit + integration (Vitest/PGlite)    |
| `npm run test:e2e`                   | Playwright (10 flows, desktop+mobile) |
| `npm run typecheck`                  | `tsc --noEmit`                        |
| `npm run db:generate` / `db:migrate` | Drizzle migrations                    |

## Performance budget (CI-enforced)

Initial JS ≤ 175 KB (transfer) per route · LCP < 2.5 s · CLS < 0.1 · Lighthouse perf ≥ 0.85, a11y ≥ 0.95. PRs that break the budget fail. (The Next 16 + next-intl baseline is ~165 KB, so any new client-side dependency trips the budget — that pressure is intentional. The dashboard funnel is pure CSS for exactly this reason.)

## Test counts

85 unit/integration tests (including property-based money/quantity tests and multi-tenant isolation suites) + 20 E2E scenarios across desktop and mobile viewports.
