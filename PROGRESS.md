# TabMind — Build Progress

Working notes so work stays organized across sessions. Keep this current.

## Status: IN PROGRESS — Phase: Foundation packages

## Environment decisions (locked)

- Node 24 / pnpm 11.18 monorepo (pnpm workspaces + Turborepo)
- No local Docker/Postgres → **PGlite** (real Postgres/WASM) for dev+tests, `pg` against managed Postgres in prod. Same Drizzle schema for both.
- Resolved versions: next 15.5, react 19.2, tailwind 4.3, vite 6.4, better-auth 1.6.27, stripe 18.5, drizzle-orm 0.44.7, pglite 0.3.16, @anthropic-ai/sdk 0.60, vitest 3.2, playwright 1.62, sentry 9.47.
- Headless Chrome available at /Applications/Google Chrome.app → used for OG image + store screenshot generation.

## Architecture decisions

- `packages/core` = deterministic tab intelligence (normalize → privacy filter → heuristic cluster → name → staleness/dedupe/cleanup → command grammar). Runs fully client-side in the extension; server AI *refines* rather than replaces. Product works signed-out, offline, zero keys.
- Extension auth = device tokens: web login → one-time link code → extension exchanges for revocable bearer token (hash stored server-side). No cookies/identity API needed.
- AI = `packages/ai`, provider-abstracted, server-only. Anthropic (Claude) primary; Voyage embeddings; graceful degradation when keys absent.
- Analytics = first-party `events` table + `track()` abstraction; optional PostHog forward via env (plain fetch, no SDK).
- Error monitoring = Sentry on web (env-gated) + first-party `/api/errors` for extension.
- Billing = Stripe Checkout + Portal + webhooks; entitlements resolved server-side from `subscriptions` table only.

## Checklist

- [x] Monorepo scaffold, pnpm 11 build approvals, deps installed
- [ ] packages/types — domain + DTO schemas
- [ ] packages/config — plans/entitlements/env/brand
- [ ] packages/core — tab intelligence + tests
- [ ] packages/db — schema/migrations/PGlite fallback/seed
- [ ] packages/ai — providers + tasks
- [ ] packages/ui — tokens/font/brand/components
- [ ] apps/extension — MV3 background/popup/dashboard/onboarding/options
- [ ] apps/web — auth/api/billing/app/settings
- [ ] marketing site + SEO + OG assets
- [ ] tests green (unit/API/e2e), CI
- [ ] security+privacy pass, design review pass
- [ ] launch docs (deploy, store listing, checklist), founder report

## Notes / gotchas

- pnpm 11: build approvals live in `pnpm-workspace.yaml` (`allowBuilds`), not package.json.
- npm global prefix on this machine points at a codex runtime dir; pnpm installed to `~/.local/bin/pnpm`.
