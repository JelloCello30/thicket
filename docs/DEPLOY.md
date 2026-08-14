# Deploying TabMind to production

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
2. `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL`: `https://tabmind.app`.
3. Google OAuth (optional but recommended): [console.cloud.google.com](https://console.cloud.google.com)
   → OAuth consent screen (External) → Credentials → OAuth client (Web) with redirect URI
   `https://tabmind.app/api/auth/callback/google` → set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Email: create a [Resend](https://resend.com) API key, verify the `tabmind.app` domain
   (SPF + DKIM records), set `RESEND_API_KEY` and `EMAIL_FROM`.

## 3. Stripe

1. Create product **TabMind Pro** with two recurring prices: **$8/month** and **$72/year**.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`.
3. Add a webhook endpoint `https://tabmind.app/api/stripe/webhook` with events
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
   Build command `pnpm --filter @tabmind/web build`, install command `pnpm install`
   (Vercel's monorepo detection usually fills these in).
2. Add every environment variable from [.env.example](../.env.example) (production scope),
   including `CRON_SECRET` (random string).
3. `vercel.json` already schedules the retention cron (`/api/cron/retention`, daily).
4. Add the `tabmind.app` domain; point DNS (A/CNAME per Vercel's instructions).
5. Deploy. Verify `/`, `/login` (magic link arrives), `/pricing`, and a full
   checkout in Stripe **test mode** before flipping the Stripe keys to live.

Migrations on future schema changes: `pnpm db:generate` locally (commit the SQL), then
`DATABASE_URL=… pnpm db:migrate` before or during deploy.

## 6. Extension

1. `pnpm --filter @tabmind/extension build` → `apps/extension/release/tabmind-<version>.zip`.
   Production builds point at `https://tabmind.app`.
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
