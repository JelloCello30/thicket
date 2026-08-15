# TabMind — Build Progress

## Status: ✅ v1.4 COMPLETE — ready for external setup (see docs/LAUNCH_CHECKLIST.md)

Everything code-side is built, tested, and verified. Remaining work is exclusively
external accounts/keys, legal customization, and the manual Chrome Web Store submission —
all documented with exact steps.

### v1.4 (grouping quality: merge, don't duplicate) — verified

Founder report, stated four times: "it groups irrelevant tabs into a different tab
group… when there are multiple tabs with the same title or topic, it should merge
into those tab groups. You shouldn't just create something new."

Fixed in the deterministic engine, in both directions:

- **Same title/page always unites.** `pairScore` returns 1.0 for an identical
  normalized URL, and floors at 0.85 when title-token Jaccard ≥ 0.8 — so a
  syndicated article or one listing on five portals lands in ONE group. Guarded at
  ≥2 content tokens so "Menu"/"Dashboard" don't glue unrelated pages.
- **One topic can't render as two groups.** `mergeDuplicateTopicDrafts` folds drafts
  that named themselves identically, or that share an entity AND a compatible kind,
  before identity matching. Special piles are exempt.
- **Shared place names no longer fuse unrelated activities.** Found while testing the
  above: an LA apartment hunt and an LA trip collapsed into one group. Three causes,
  all fixed — a single lexicon word could give a site a rival activity theme
  ("vacation *rentals*" on Airbnb → realestate); vocabulary and entity signals were
  undamped across conflicting categories (a flat −0.08 vs a +0.35 entity bonus); and
  entity-merge ignored kind. Cross-activity pair scores fell 0.70 → 0.15 (union bar
  0.45) while same-activity pairs stayed at 1.0.
- **A 13-agent adversarial audit** then hunted the engine across five realistic sessions
  (dev workday, cross-retailer shopping, two-topic research, same-topic news/listings,
  47-tab chaos). It confirmed 8 defects, refuted 0, and caught two regressions from the
  fixes above. All fixed:
  - Site chrome was read as a topic — two pull requests from different repos both yielded
    the entity "Pull Request" and fused; every MDN page shared "Web APIs". Chrome phrases
    and the site's own brand are now rejected as entities.
  - Title-case headlines yielded NO entity at all (any run containing a capitalized
    connective was discarded), so five outlets covering one story shared nothing. The
    head of the headline is now emitted: three outlets on one story become one group
    named for it. Long runs are truncated rather than dropped, so product names survive.
  - Category was counted twice (same-category bonus + a theme derived from that same
    category) — a flat 0.53, over the union bar, with zero topical evidence, fusing any
    two trips. A theme now counts only when at least one title evidences it.
  - Big multi-topic hosts (GitHub, arXiv, marketplaces) no longer treat the hostname as
    proof; the leading path decides whether it is the same repo/product/paper.
  - Hash-routed apps (Gmail, Calendar, Slack) keep their fragment, so unrelated views
    stopped normalizing to one URL and fusing — and stopped being offered as duplicates.
  - Scholarly and retail domains were missing from the site table and fell to "other",
    stranding tabs whose titles named the very topic beside them. ~30 domains added.
  - A shorter retailer title that is a subset of a longer one now counts as the same
    product (containment, not just symmetric overlap).
  - Two regressions the audit caught in my own fixes, both closed: two unrelated
    purchases fused because both fell back to the label "Shopping" (generic labels are
    no longer topic identities; colliding groups are disambiguated instead), and a
    user's own group name could be overwritten by that disambiguation (never now).
- Regression suite `packages/core/test/merge-over-create.test.ts` (14 tests) locks all
  of it in, including the opposite failure (over-merge). NerdWallet's rent calculator
  still correctly joins Apartment Hunt, and the 47-tab fixture is byte-identical to
  before this work — verified by direct measurement and in the e2e, not just asserted.

**Known limitation, stated honestly:** two projects on the same host with heavily shared
vocabulary (two repos under one org) can still land in one group. Path-derived tokens
were tried and reverted — they made it worse, because the shared org slug glues rather
than separates.

### v1.3 (full audit + focus removal) — verified

- **Focus mode removed** at the founder's request (2026-08-14). All of it: core
  engine, intercept page, badge, dialog, settings, command grammar, marketing
  section, pricing line, store bullet, e2e checks. Recoverable from git history
  (last full version: commit 9038c33).
- **Summarize/Compare always work now**: a deterministic on-device engine answers
  signed-out or on any server failure (top sites, price ranges from titles,
  search origins, keep-list, next step; honest "made on this device" note).
  E2E-verified signed out. AI replaces it when available.
- Keyboard a11y: all hover-revealed actions also reveal on focus.
- Dashboard error state gained retry; command-bar summaries titled by group;
  command bar placeholder is honest about AI availability.
- Download page: the store CTA renders only once the listing is live; until
  then, honest run-from-source instructions (no dead primary button).

### v1.2 (reliability + respect + deletion) — verified

- **Pre-existing native tab groups are sacred**: groups the user made in Chrome come
  through analysis as locked groups (their title, color, membership — verbatim, with a
  "yours" badge), clustering never splits or absorbs them, the mirror never moves their
  tabs, and automations treat their tabs as protected. Renames/drags done in the TabMind
  dashboard on a native group apply natively (explicit actions). E2E-proven: a hand-made
  zillow+kayak "My mix" group survives analysis + mirroring untouched.
- **Search/ask reliability**: sendBg retries while the MV3 worker wakes; empty results
  state tells the truth (what was searched, whether AI can help); when local search
  finds nothing and AI is on, the request escalates to server interpretation once; the
  popup "Ask TabMind" row and ⌘⇧K now open the dashboard WITH the command bar open.
- **Focus lockdown**: third strictness level — only the task's groups and explicitly
  allowed domains pass. Strictness is chosen per session in the Focus dialog (defaults
  from Settings; default is now Strict).
- **History deletion**: hover-× forgets a single page from local page memory, recently
  closed, undo batches, AND the synced server copy (queued + retried until delivered);
  "Clear history…" (two-step) wipes all of it. DELETE /api/sync/pages removes rows —
  embeddings live on the row, so nothing lingers. API-tested.

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
