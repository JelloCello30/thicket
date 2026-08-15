# TabMind — Build Progress

## Status: ✅ v1.1 COMPLETE — ready for external setup (see docs/LAUNCH_CHECKLIST.md)

Everything code-side is built, tested, and verified. Remaining work is exclusively
external accounts/keys, legal customization, and the manual Chrome Web Store submission —
all documented with exact steps.

### v1.1 (focus, automations, help, tuning) — verified

- **Focus mode**: type a task → TabMind maps it to your groups; off-task navigations are
  intercepted by a calm page with four honest ways out (back to work, this-is-on-task,
  timed break, end focus). Badge shows minutes left. All on-device.
  **Behaviorally e2e-tested**: during a "compare mirrorless cameras" session the harness
  navigates to youtube.com, asserts redirect to the intercept page, clicks
  "youtube.com is on-task", and asserts pass-through back to youtube.
- **Automations**: plain-language when/then rules (group untouched N days → save+close;
  duplicates → close extras; >N tabs → collapse unused groups), run after each analysis
  with 30-min cooldowns, protected tabs (pinned/active/audible), an activity log, and
  undo on every close.
- **Restored tabs return to their original group**: group identity is captured at close
  (batches + history records), reopened URLs are locked back to the group, and group
  memory retains vanished groups for 7 days so the locks land. Applies to undo,
  workspace restore, and single-tab reopen.
- **Help that shows or does**: help panel with 10 task topics; each can explain, run a
  spotlight tour over the live UI (data-help anchors), or perform the action directly.
- **Tuning**: grouping style (calm/balanced/eager), staleness window, focus strictness
  (gentle/strict), break length — all in Settings, re-analyzing on change.
- Core suite now 71 tests (12 focus, 6 rules); e2e asserts 11 checks including the two
  behavioral focus checks; lint/typecheck/test/build all green.

## Verified working (not just written)

- **Extension e2e in real Chromium** (`node scripts/extension-e2e.mjs`): loads the built
  MV3 extension, opens a 17-tab realistic session (real domains, stubbed responses),
  asserts grouping into Apartment Hunt / Trip Planning / Work / Camera Research, tests
  focus interception behaviorally, and captures eight Chrome Web Store screenshot
  candidates from the live product.
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
