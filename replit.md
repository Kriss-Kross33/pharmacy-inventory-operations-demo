# Pharmacy Operations Demo

A frontend-only pharmacy inventory and operations demo for a small pharmacy in Ghana, with role-based demo access and local browser persistence.

## Run & Operate

- `yarn dev` — run the pharmacy app
- `yarn typecheck` — full typecheck across all packages
- `yarn build` — typecheck + build all packages
- `yarn workspace @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `yarn workspace @workspace/db push` — push DB schema changes (dev only)

The pharmacy demo does not use the API server or database. It runs with deterministic sample data stored in browser localStorage.

## Stack

- Yarn workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pharmacy-ops/` — pharmacy operations web app.
- `artifacts/pharmacy-ops/src/lib/repository.ts` — domain types, deterministic seed data, browser persistence, and business operations.
- `artifacts/pharmacy-ops/src/App.tsx` — routed application screens and interactions.
- `artifacts/pharmacy-ops/src/index.css` — app design tokens and responsive styling.
- `artifacts/api-server/` and `lib/db/` are workspace scaffolding, not dependencies of this demo.

## Architecture decisions

- Demo accounts are role selectors for evaluation only; they are not production authentication or authorization.
- The prototype is deliberately frontend-only. Keep storage access behind the repository layer so a future API implementation can replace it without components reading localStorage directly.
- Browser localStorage is not secure, tamper-proof, multi-device storage, or a production backup/recovery mechanism.

## Product

The app demonstrates a Ghanaian pharmacy's medicine catalog, batch-aware stock, sales/POS, supplier purchases, stocktaking, reports, alerts, employee roles, and an audit trail. Its local records are shared across screens and survive refreshes in the same browser.

## User preferences

- Keep the current phase frontend-only: no real authentication server, cloud database, payment gateway, or external API.
- Use fictional pharmacy, supplier, and price data; do not enter real patient information.

## Gotchas

- Clearing browser storage can remove demo changes. Exporting local JSON is a convenience for this demo, not a production-grade backup.
- Demo role checks in the browser must never be treated as security controls for real pharmacy data.

## Pointers

- See the workspace `package.json` files for workspace structure, TypeScript setup, and package details
