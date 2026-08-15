# Architectural decisions

The load-bearing choices and why they were made. Newest last.

**Deterministic core first, AI as refinement.** Clustering runs entirely client-side in
`packages/core` (domains, curated site knowledge, intent lexicons, session-keyword glue,
entities, opener edges). The product therefore works signed out, offline, with zero API
cost — and stays fast and predictable. The LLM improves names/insights and powers Pro
features; it never gates the aha moment. This also made the privacy story structural
rather than promissory.

**PGlite for dev/test, node-postgres for prod, one Drizzle schema.** No Docker requirement
on contributor machines; tests run against a real Postgres engine (unique constraints,
cascades, pgvector similarity all verified for real), and production uses boring managed
Postgres. `webpackIgnore` keeps PGlite's WASM out of the Next bundle.

**Device tokens instead of cookies for the extension.** Web login mints a one-time code
(10-min TTL, hashed at rest); the extension exchanges it for a revocable bearer token
(SHA-256 stored). No cookies in the extension, no `identity` permission, per-device
revocation in Settings, CORS pinned to the published extension ID.

**Model tiering for cost.** High-frequency latency-sensitive tasks (organize, naming,
command parsing) run on `claude-haiku-4-5`; quality-sensitive Pro features (summaries,
comparisons) on `claude-opus-5`. Both env-overridable; per-task caps and result caching
are durable (DB), so a free user costs cents/month worst case.

**Entitlements enforced server-side only.** The `subscriptions` table (written exclusively
by the signature-verified, idempotent Stripe webhook) is the single source of truth. UI
buttons are conveniences; every API re-checks.

**First-party analytics with an allowlist.** Events land in our own table (name + coarse
props, never URLs/titles/content), forwarded to PostHog only if configured. Signed-out
extensions send nothing — no anonymous IDs are minted.

**Privacy is one auditable file.** `packages/core/src/privacy.ts` holds every never-store /
never-sync rule (incognito, auth/payment flows, sensitive-param stripping, default bank +
health exclusions). The server re-applies it on ingest — the client is never trusted.

**Opener edges are corroborating, not decisive (learned from e2e).** Browsers assign
`openerTabId` to adjacently-created tabs, which daisy-chained unrelated activities in
testing. A bare opener across incompatible categories now scores 0.3 (below union);
category-compatible click-throughs keep the full 0.5.

**Fonts/self-hosting.** General Sans (Fontshare Free Font License) self-hosted as a
variable font — one family everywhere, no third-party font requests.

**In-memory rate limits, documented ceiling.** Fine for single-region v1; the module is
shaped for a drop-in Upstash swap when scaling out. AI caps, which have money attached,
are DB-backed already.

## v1.1 — focus, automations, help (2026-08)

- **Focus verdicts are deterministic and local.** `assessTabFocus` ranks: user allowlist
  → tab in a task-relevant group → token overlap with the task → known leisure category
  (social/media/discussion/news) → strictness default. No AI call on the navigation
  path — interception must be instant and private.
- **Relevant groups are found, not declared.** The task string is matched against group
  names/members via the same search ranking users see; the active tab's group is always
  included. Post-analysis, `refreshFocusGroups` re-anchors ids so re-clustering never
  strands a session.
- **Interception is a redirect, not a block.** `chrome.tabs.update` to a calm intercept
  page with the URL carried in params — every exit is one click, including "this domain
  is on-task" (persisted for the session) and a timed break. A 4s guard prevents
  re-intercept loops while the user decides.
- **Automations only do what the user could undo.** Rule actions reuse the same
  `closeTabs` path as manual closes (undo batches, protected pinned/active/audible tabs,
  special piles never auto-archived), run at most every 30 minutes per rule, and write
  an activity log with per-entry undo.
- **Restore-to-origin is identity capture, not guesswork.** Group name/color/id are
  recorded at close time on the batch and history record; restores lock URLs back to the
  group id (bounded at 200 locks) and group memory retains vanished groups for 7 days so
  the clusterer can re-materialize them under the same id.
- **Help topics are a local registry**, ranked by the shared search scorer; "show me"
  drives a spotlight overlay over real UI via data-help anchors (no screenshots, no
  fake UI), and "do it" invokes the same handlers as the buttons themselves.
- **Tuning maps to math, not vibes.** Grouping styles are threshold offsets on the
  clusterer (calm +0.05/min 3, eager −0.06/min 2); staleness is an hours parameter
  threaded through analysis. Changing either re-analyzes immediately.
