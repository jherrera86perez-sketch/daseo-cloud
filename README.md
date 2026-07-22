# Daseo Cloud

Multi-tenant SaaS ERP for small manufacturers and retailers in Latin America — sales, inventory with real costing, production (BOM), and multi-currency collections (CUP/USD/BRL). Spanish and Portuguese UI.

> Cloud rebuild of CubaOne ERP, a 26-module desktop ERP running a real detergent factory. Built for markets with slow connections: strict performance budget enforced in CI.

## Stack

- **Next.js 16** (App Router, RSC, Partial Prerendering) + TypeScript
- **Tailwind CSS v4** + shadcn/ui, OKLCH design tokens, light/dark
- **PostgreSQL** (Neon) + Drizzle ORM _(from M1)_
- **next-intl** — Spanish (default) + Portuguese
- **Vitest** (+ PGlite for integration) · **Playwright** E2E · **Lighthouse CI** performance budget
- Deployed on **Vercel**

## Development

```bash
npm install
npm run dev        # http://localhost:3000 (es) · /pt (pt)
```

| Script                  | Purpose                        |
| ----------------------- | ------------------------------ |
| `npm run typecheck`     | TypeScript, no emit            |
| `npm run lint` / format | ESLint / Prettier              |
| `npm test`              | Unit & integration (Vitest)    |
| `npm run test:e2e`      | Playwright (build+start first) |
| `npm run build`         | Production build               |

## Performance budget (CI-enforced)

Initial JS ≤ 175 KB (transfer) per route · LCP < 2.5 s · CLS < 0.1 · Lighthouse perf ≥ 0.85, a11y ≥ 0.95. PRs that break the budget fail. (The Next 16 + next-intl baseline is ~165 KB, so any new client-side dependency trips the budget — that pressure is intentional.)

## Architecture notes

- Business logic lives in `src/features/*/{actions,queries}.ts` — components stay dumb; the future public REST API reuses the same layer.
- Multi-tenant by organization: every table carries `org_id`; every query requires it (isolation verified by a dedicated test suite).
- Money = `bigint` cents + currency + exchange rate fixed per document; inventory valuation always in the org's base currency.
