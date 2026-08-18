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
3. After the store assigns the extension ID: set `TABMIND_EXTENSION_IDS=<id>` in Vercel
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

Going live needs three accounts. **These require entering payment and identity
details, so they have to be created by you — not by Claude.** Each one is
independent; the capability endpoint turns features on as their keys appear.

| Step | What to do | Turns on |
|---|---|---|
| 1. Host | Deploy `apps/web` anywhere that runs Node (Vercel, Fly, Railway). Set `NEXT_PUBLIC_APP_URL` to that origin. | Accounts, sync |
| 2. Database | Provision Postgres with `pgvector` (Neon or Supabase). Set `DATABASE_URL` to the **pooled** endpoint. Run `pnpm --filter @thicket/db migrate`. | History, workspaces |
| 3. Anthropic | Create a key at console.anthropic.com. Set `ANTHROPIC_API_KEY`. | AI summaries, comparisons, semantic search |
| 4. Stripe | Create the product and monthly/yearly prices. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`. | Checkout, billing portal |

Then, in the extension: set the production `__APP_URL__` in
`apps/extension/vite.config.ts` to the server origin from step 1, and add that
origin to `externally_connectable.matches` in `apps/extension/manifest.json`.
Until you do, the extension will keep asking a static host and correctly
conclude there is nothing to sign into.

Two things to set in the Stripe Dashboard that the code cannot set for you:

- **Turn on invoice/receipt emails.** Free, and customers expect them.
- **Set the dunning schedule** to cancel after retries. The code bounds the
  `past_due` grace period at 14 days regardless, but the two should agree.

Two required env vars fail closed if unset, by design: `CRON_SECRET` (the
retention endpoint refuses to run without it) and `THICKET_EXTENSION_IDS`
(the CORS allowlist refuses unknown extensions in production).
