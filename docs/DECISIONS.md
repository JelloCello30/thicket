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

## v1.2 — respect and deletion (2026-08)

- **User-created native tab groups outrank the clusterer.** Ownership is tracked by the
  session mirror map; any native group TabMind can't prove it created is the user's.
  Their tabs are partitioned out before clustering and re-emitted as locked groups
  (id `native-<chromeGroupId>`, user's title/color, confidence 1, never stale). After a
  browser restart the map is empty, so TabMind's own old groups are adopted as the
  user's rather than fought over — continuity beats ownership.
- **Deletion propagates.** Forgetting a page removes it locally (page memory, recently
  closed, undo batches) and queues the normalized URL for server deletion; the queue
  survives offline and flushes on the sync alarm ("*" = clear-all). Deletion flushes
  even when sync is off — it's a privacy action, not a sync feature.
- **Search never dead-ends silently.** The worker-wake retry, the honest empty state,
  and the one-shot AI escalation each remove a distinct "it did nothing" failure mode.
- **Lockdown is predictable, not clever.** It ignores token overlap on purpose: "only
  my task's tabs" has to mean exactly that, or the wall teaches the user nothing.

## v1.3 — audit pass (2026-08)

- **Focus mode was removed** on founder request. The deterministic verdict
  engine, intercept UX, and strictness tiers live in git history (9038c33) if
  it ever returns. Tab-focus (jump-to-tab) is unrelated and stays.
- **No dead buttons, ever**: every AI-labeled action now has a deterministic
  local fallback (summaries and comparisons from titles/domains/activity),
  labeled honestly, upgraded silently when AI is available. An error toast is
  never the primary experience of a feature.
- **Hover affordances must also be focus affordances** — every action revealed
  on hover reveals on keyboard focus too.

## v1.4 — grouping quality (2026-08)

- **Merge beats create.** When tabs share a title or topic they join the existing
  group; the engine never opens a rival group for a topic that already has one. Two
  visible groups with the same name is treated as a bug outright, not a tie.
- **Identity signals are ranked by how forgeable they are.** Same normalized URL is
  proof (1.0). Near-identical titles are near-proof (floor 0.85) and deliberately
  outrank category mismatch — a syndicated story is one topic wherever it is hosted.
  Shared *vocabulary* and shared *entities*, by contrast, are the weakest identity
  signals, because a city or brand name appears across genuinely different
  activities; they are damped 0.45× when categories conflict and no theme agrees.
- **Activity theme outranks site category.** A theme match means the user's activity
  matches, which is what grouping is about; a category mismatch only means the site
  types differ. So a shared theme lifts topical damping entirely (finance +
  realestate = a rent calculator in the apartment hunt, correctly).
- **…but a site's own category outranks one loose lexicon word.** Anchored themes
  (realestate/travel/jobs/learning — the ones a category asserts) need 2 strong or 3
  weak hits to override the site's category, so "vacation rentals" on a travel site
  stays travel. This asymmetry is the whole fix for cross-activity bridging.
- **Every clustering change must be measured on both failure modes.** Fragmentation
  (failing to merge) and fusion (merging the unrelated) trade off against each other;
  a change that fixes one and worsens the other is a net loss. The 47-tab quality
  fixture plus merge-over-create.test.ts pin both ends.

## v1.4b — what a 13-agent adversarial audit changed (2026-08)

Five agents each built a realistic session (dev workday, cross-retailer shopping,
two-topic research, same-topic news, 47-tab chaos), ran it through the real clusterer,
and reported measured defects; eight more tried to refute them. 8 confirmed, 0 refuted.
The durable lessons:

- **The tuned fixture is the only honest regression signal.** The full test suite stayed
  green while the fixture silently split a 12-tab Tokyo trip into 10 tabs plus a rival
  2-tab group — itself a merge-over-create violation. Every clustering change is now
  measured against the fixture's group names AND sizes, not just assertions.
- **A site's furniture is not a topic.** Entity extraction was reading "Pull Request",
  "Web APIs", and "Amazon.com" as proper nouns and paying up to +0.35 for them, which
  fused unrelated repos and reference pages. Chrome phrases and the site's own brand are
  rejected outright.
- **Rejecting noisy input threw away the signal with it.** Title-case headlines were
  discarded wholesale because they contain capitalized connectives ("To", "For"), so
  outlets covering one story shared no entity at all. Keeping the head of the run
  (the subject) rather than the whole run recovers the signal without the noise —
  the fix has to be surgical, because splitting at stopwords re-introduced junk
  entities and immediately regressed the fixture.
- **Never pay twice for one fact.** A category granted a theme, and the theme was then
  scored as independent evidence on top of the same-category bonus: a flat 0.53, above
  the union bar, for two tabs that agreed on nothing but being travel sites.
- **The hostname is not the unit of meaning on big sites.** GitHub, arXiv, and
  marketplaces host unrelated things; the leading path segments are what identify them.
  But this must be scoped tightly — travel aggregators and work tools were in the first
  version of that list and fragmented real activities, because three Kayak searches are
  one trip.
- **A fallback label is not an identity.** Two unrelated purchases both named "Shopping"
  are not one topic. Generic bucket labels are excluded from topic-merging and the
  colliding groups get disambiguated instead — which satisfies "never show two groups
  with the same name" without fusing unrelated work.
- **Fixes get adversarially reviewed too.** Two of the eight confirmed defects were
  regressions introduced by the fixes earlier the same day. Verifiers also rejected
  three proposed fixes with measurements (lowering thresholds collapses the fixture into
  a 20-tab mega-group; making "other" a specific category attacks the exact tabs the
  fixture asserts on; removing entity/token double-counting demotes a real group).
