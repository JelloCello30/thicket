# TabMind — Build Progress

## Status: ✅ v1 COMPLETE — ready for external setup (see docs/LAUNCH_CHECKLIST.md)

Everything code-side is built, tested, and verified. Remaining work is exclusively
external accounts/keys, legal customization, and the manual Chrome Web Store submission —
all documented with exact steps.

## Verified working (not just written)

- **Extension e2e in real Chromium** (`node scripts/extension-e2e.mjs`): loads the built
  MV3 extension, opens a 17-tab realistic session (real domains, stubbed responses),
  asserts grouping into Apartment Hunt / Trip Planning / Work / Camera Research, and
  captures the five Chrome Web Store screenshots from the live product.
- **Auth + device flow live**: magic link → session → /app → connect code → bearer token
  → workspace sync → search returns the synced tab → code reuse rejected.
- **82 unit/API tests green**: core 53 (clustering quality bar on the 47-tab fixture,
  privacy, commands, cleanup, search), db 4 (constraints, cascade, pgvector), ai 10
  (routing, prompts, degradation, cost), web API 15 (device auth, entitlement caps,
  ownership, privacy re-filtering, webhook signature + idempotency + upgrade).
- **Builds clean**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass;
  CI workflow runs the same plus the e2e.
- Marketing site reviewed via screenshot in light/dark/mobile; hero demo animates
  47 real chips into 5 groups (reduced-motion renders settled state).

## Environment decisions (locked)

- pnpm 11 + Turborepo; Node ≥ 20.9. PGlite for dev/tests, node-postgres in prod.
- Versions: next 15.5, react 19.2, tailwind 4.3, vite 6.4, better-auth 1.6.27,
  stripe 18.5, drizzle 0.44.7, @anthropic-ai/sdk 0.116, playwright 1.62.
- Headless Chrome renders og.png + any future promo assets (scripts/og-template.html).

## Key gotchas encountered (for future sessions)

- pnpm 11 build approvals live in `pnpm-workspace.yaml` → `allowBuilds`.
- Branded Chrome removed `--load-extension`; e2e uses Playwright's Chromium.
- Browsers set `openerTabId` on adjacently-created tabs → opener edges are now
  corroborating (0.3) unless categories agree (0.5). E2E opens tabs from a neutral
  launcher to avoid fabricated chains.
- Next build: PGlite must stay unbundled (`webpackIgnore`), db/auth init must be lazy
  (build-time page-data collection executes module init), `NEXT_PHASE` gates strict env.
- Browser-pane screenshots can serve stale frames while hidden; headless Chrome
  captures are ground truth.
- `server-only` needs a stub alias in vitest.

## Design review (AI-slop checklist) — passed

No gradients; single spruce accent; rows/lists over cards in the product; varied
marketing section layouts; left-aligned editorial type; hand-drawn minimal icons; zero
banned phrases (grep-verified); no fake logos/testimonials/stats; dark + light + mobile
verified; reduced-motion + ARIA + focus states throughout; empty states are contextual.

## Post-launch backlog (highest value first)

Tracked in the founder report: Firefox port, saved-searches/pinned insights, shared
workspaces, per-group auto-close rules, richer compare extraction with content opt-in,
Raycast/Alfred-style global launcher, weekly "what you researched" digest, workspace
templates, team plan, local semantic search via WASM embeddings.
