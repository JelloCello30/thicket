# Deploying Thicket to production

The stack: Vercel (web + API) · managed Postgres with pgvector (Neon recommended) ·
Stripe · Resend · Anthropic + Voyage. Total setup is roughly an hour.

## 1. Database

1. Create a Postgres database on [Neon](https://neon.tech) (or Supabase/RDS — anything
   with `pgvector`).
2. Copy the connection string into `DATABASE_URL`.
3. Run migrations from your machine (they also create the `vector` extension):

   ```bash
   DATABASE_URL="postgres://…" pnpm db:migrate
   ```

## 2. Auth

1. `BETTER_AUTH_SECRET`: `openssl rand -base64 32`.
2. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`: `https://jellocello30.github.io/thicket`.
3. Google OAuth (optional but recommended): [console.cloud.google.com](https://console.cloud.google.com)
   → OAuth consent screen (External) → Credentials → OAuth client (Web) with redirect URI
   `https://jellocello30.github.io/thicket/api/auth/callback/google` → set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Email: create a [Resend](https://resend.com) API key, verify the `jellocello30.github.io/thicket` domain
   (SPF + DKIM records), set `RESEND_API_KEY` and `EMAIL_FROM`.

## 3. Stripe

1. Create product **Thicket Pro** with two recurring prices: **$8/month** and **$72/year**.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`.
3. Add a webhook endpoint `https://jellocello30.github.io/thicket/api/stripe/webhook` with events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`;
   set `STRIPE_WEBHOOK_SECRET` from it.
4. Enable the **Customer Portal** (Settings → Billing → Customer portal) so
   "Manage billing" works.

## 4. AI

- `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com).
- `VOYAGE_API_KEY` from [voyageai.com](https://www.voyageai.com) (semantic search embeddings).

Defaults route high-frequency tasks to `claude-haiku-4-5` and quality tasks
(summaries/comparisons) to `claude-opus-5`; override with `AI_MODEL_FAST` / `AI_MODEL_SMART`.

## 5. Vercel

1. Import the repo; framework auto-detects Next.js. Root directory: `apps/web`.
   Build command `pnpm --filter @thicket/web build`, install command `pnpm install`
   (Vercel's monorepo detection usually fills these in).
2. Add every environment variable from [.env.example](../.env.example) (production scope),
   including `CRON_SECRET` (random string).
3. `vercel.json` already schedules the retention cron (`/api/cron/retention`, daily).
4. Add the `jellocello30.github.io/thicket` domain; point DNS (A/CNAME per Vercel's instructions).
5. Deploy. Verify `/`, `/login` (magic link arrives), `/pricing`, and a full
   checkout in Stripe **test mode** before flipping the Stripe keys to live.

Migrations on future schema changes: `pnpm db:generate` locally (commit the SQL), then
`DATABASE_URL=… pnpm db:migrate` before or during deploy.

## 6. Extension

1. `pnpm --filter @thicket/extension build` → `apps/extension/release/thicket-<version>.zip`.
   Production builds point at `https://jellocello30.github.io/thicket`.
2. Submit per [CHROME_WEB_STORE.md](CHROME_WEB_STORE.md).
3. After the store assigns the extension ID: set `THICKET_EXTENSION_IDS=<id>` in Vercel
   **and** replace `EXTENSION_ID_PENDING` in `packages/config/src/brand.ts`
   (the store URL used by /download), then redeploy.

## Scaling notes (documented, not yet needed)

- Per-user rate limits are in-memory per instance; on multi-region scale-out move
  `apps/web/src/lib/rate-limit.ts` to Upstash Redis (drop-in shape).
- AI result caching + daily caps are DB-backed and scale as-is.
- PGlite is dev-only; production always requires `DATABASE_URL`
  (the server refuses to boot without it).

---

## Turning the paid tier on

The extension asks its configured server what that deployment supports
(`GET /api/capabilities`) and shows only what is actually there. The current
GitHub Pages build is static — no server, so no account, no AI, no billing, and
nothing paid is offered. That is the honest default, not a bug.

Going live needs **five signups**, six if you want email login. **Several require
payment details and one requires legal identity, so they have to be created by
you — not by Claude.** Each is independent; the capability endpoint turns
features on as their keys appear.

| # | Signup | Time | Legal identity | Turns on |
|---|---|---|---|---|
| 1 | **Host** — Vercel, or any Node 20.9+ box (Fly, Railway, Render) | 15 min | No (card only if you take money) | Accounts, sync, the API |
| 2 | **Postgres + pgvector** — Neon, Supabase, RDS | 15 min | No | History, workspaces, search |
| 3 | **Anthropic** — console.anthropic.com | 10 min | No (card, to buy credits) | Organize, summarize, compare, command |
| 4 | **Voyage AI** — voyageai.com | 7 min | No (free to 200M tokens) | Semantic search — **see below** |
| 5 | **Stripe** — dashboard.stripe.com | 25 min | **Yes**, for live keys | Checkout, billing portal |
| 6 | **Resend** — resend.com | 10 min | No (you need a domain) | Magic-link email delivery |

Signup 6 is only optional on paper: without `RESEND_API_KEY` the magic link is
printed to the server console, which in production means nobody can log in by
email. Skip it only if you ship Google-only sign-in.

### Voyage AI is a separate company

The one that surprises people. Semantic search does **not** use
`ANTHROPIC_API_KEY` — `packages/ai/src/embeddings.ts:70` reads `VOYAGE_API_KEY`
and nothing else, and the search route never touches the Anthropic provider.
Voyage is its own account, its own dashboard, its own billing. Sign up for
Anthropic alone and you ship a Pro tier whose headline feature does nothing,
while `/pricing` keeps selling "Meaning-based search" at $8/month.

Worse, it is not retroactive. Embeddings are written only at ingest, for new or
changed pages (`api/sync/pages/route.ts:85-95`), and nothing backfills them —
the retention cron only deletes rows. **Set `VOYAGE_API_KEY` before the first
user syncs**, or every page already in the database stays permanently
unsearchable by meaning. And when the key is wrong rather than absent, the
failure is invisible: `api/search/route.ts:146` swallows the error and returns
ordinary lexical results.

### The variable names, from the code

Two names attract near-misses. Both are `.optional()` in the schema, so a typo
throws nothing — the feature just quietly never turns on:

- `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` — note the `PRO` infix
  (`packages/config/src/env.ts:37-38`). Drop it and billing stays off.
- `THICKET_EXTENSION_IDS`, not `THICKET_EXTENSION_IDS`
  (`packages/config/src/env.ts:47`). The legacy prefix survived the rename.

Also ignore §2's `https://jellocello30.github.io/thicket` for `BETTER_AUTH_URL`
and `NEXT_PUBLIC_APP_URL`. That is the Pages URL and it carries a subpath. A
Node deploy needs your own bare origin — `https://…`, no trailing slash, no
path, and the *same* origin in both variables, or Stripe returns customers to a
host they are not signed in on.

Required to serve traffic at all: `NODE_ENV=production`, `DATABASE_URL`,
`BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`,
`CRON_SECRET`. Never set on a server: `STATIC_EXPORT`, `PAGES_BASE_PATH`,
`PGLITE_DIR`, `NEXT_PHASE` — they belong to the Pages build and local dev, and
`STATIC_EXPORT=1` does not degrade gracefully, it changes the build target.

### The commands

```bash
# 1. after provisioning Postgres — run from a checkout, with the DIRECT url
node scripts/go-live.mjs migrate --url "postgres://…"

# 2. product, both prices, webhook endpoint — idempotent, safe to re-run
STRIPE_SECRET_KEY=sk_test_… node scripts/go-live.mjs stripe --origin https://your-origin

# 3. audit every variable and live-test every key that is set
vercel env pull .env.production
node --env-file=.env.production scripts/go-live.mjs check --origin https://your-origin
```

`check` reports present/missing for every variable the code reads, then actually
exercises the ones that are there: it opens the Postgres connection and proves
the `<=>` operator resolves, calls both Anthropic model tiers, embeds a string
through Voyage and confirms it comes back 1024-dimensional, retrieves the Stripe
account and both prices, and probes `/api/capabilities` and `/api/cron/retention`
on the deployed origin. It prints masked prefixes, never secret values, and exits
non-zero when anything required is missing. Run it with nothing set and it prints
the whole to-do list.

`migrate` wants the **direct** connection string (`CREATE EXTENSION` and the
migration transaction dislike transaction pooling); the app wants the **pooled**
one, because each instance opens up to 10 connections. Migrations are never
applied at deploy time — an unmigrated database boots fine and fails at the first
query.

### Four things only the Stripe Dashboard can do

- **Activate the Customer Portal** (Settings → Billing → Customer portal), or
  every "Manage billing" click errors.
- **Configure Stripe Tax** (Settings → Tax: origin address, registrations).
  Checkout sends `automatic_tax: { enabled: true }` and errors outright without it.
- **Turn on invoice/receipt emails.** Free, and customers expect them.
- **Set the dunning schedule** to cancel after retries. The code bounds the
  `past_due` grace period at 14 days regardless, but the two should agree.

Run a full test-mode checkout with card `4242 4242 4242 4242` and confirm the
account flips to Pro before you touch live keys. That single pass proves the
webhook secret and the price-id → interval mapping at once. The webhook is the
only writer of subscription state: if `STRIPE_WEBHOOK_SECRET` is missing,
checkout still works, customers are still charged, and nobody ever gets Pro.

### Then the extension

Set the production `__APP_URL__` in `apps/extension/vite.config.ts` to your
server origin, and add that origin to `externally_connectable.matches` in
`apps/extension/manifest.json`. Until you do, the extension keeps asking a static
host and correctly concludes there is nothing to sign into.

Two variables fail closed by design, and both fail *silently*: `CRON_SECRET` —
unset, the retention endpoint 401s forever while the daily cron keeps firing, so
retention never runs and nothing tells you; and `THICKET_EXTENSION_IDS` — in
production the allowlist is authoritative including when empty, so until you set
the store-assigned ID the extension works against localhost and appears broken
against production.
