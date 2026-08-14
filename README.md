# TabMind

**Your tabs, organized by what you're actually doing.**

TabMind is a Chrome extension + web service that understands *why* your tabs are open, groups
them into projects automatically, and remembers everything when you're ready to close it all.
Tabs aren't really tabs — they're unfinished intentions.

## How it works

Organization is **deterministic and local-first**: the extension analyzes tab titles, URLs,
domains, and relationships entirely on-device (`packages/core`), so the product works signed
out, offline, with zero keys. Signing in adds sync and a server-side AI layer that *refines*
names and insights, powers summaries/comparisons, and makes closed tabs semantically
searchable — it never replaces the local pipeline.

```
apps/
  extension/   Chrome MV3: service worker (analysis, sync, native group
               mirroring), full dashboard, popup, onboarding
  web/         Next.js 15: marketing site, auth, dashboard mirror, settings,
               and the whole API (sync, search, AI, billing, account data)
packages/
  core/        Tab intelligence: URL normalization, privacy layer, clustering,
               naming, staleness, cleanup, command grammar, lexical search
  ai/          Provider-abstracted server AI (Anthropic + Voyage), model
               tiering, prompts, cost accounting
  db/          Drizzle schema + migrations; node-postgres in prod, PGlite
               (real Postgres/WASM) for dev & tests
  ui/          Design tokens, General Sans, brand, shared React primitives
  types/       Domain model + zod wire schemas shared by client and server
  config/      Plans/entitlements, brand, timings, env validation
```

## Development

Requirements: Node ≥ 20.9, pnpm ≥ 9. No database or Docker needed — dev uses PGlite.

```bash
pnpm install
pnpm db:seed        # optional: demo user (demo@tabmind.app) + realistic workspaces
pnpm dev            # web app on http://localhost:3000 (+ extension watch build)
```

Sign-in works immediately: magic links print to the server console when no email key is set.

**Load the extension:** `pnpm --filter @tabmind/extension build`, then
chrome://extensions → Developer mode → *Load unpacked* → `apps/extension/dist`.
Dev builds talk to `http://localhost:3000` automatically.

Everything degrades honestly without keys — see [.env.example](.env.example) for what each
variable unlocks.

## Tests

```bash
pnpm test                       # unit + API tests (core: 53, db: 4, ai: 10, web API: 15)
node scripts/extension-e2e.mjs  # loads the built extension into Chromium, opens a
                                # realistic 17-tab session, asserts the grouping,
                                # and regenerates the Chrome Web Store screenshots
pnpm typecheck && pnpm build    # strict TS + production builds
```

## Docs

- [docs/DEPLOY.md](docs/DEPLOY.md) — production deployment, step by step
- [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md) — store listing kit + submission
- [docs/DECISIONS.md](docs/DECISIONS.md) — the architectural decisions and why
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, privacy architecture, data handling
- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) — the exact remaining steps to go live
- [PROGRESS.md](PROGRESS.md) — build log

© TabMind. All rights reserved.
