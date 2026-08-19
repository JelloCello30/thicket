# Launch checklist

The exact remaining steps, in order. Everything code-side is done; these are the
external-account and judgment steps a human must perform.

## 1. Accounts & keys (~1 hour)

- [ ] Neon (or equivalent) Postgres → `DATABASE_URL`; run `pnpm db:migrate` against it
- [ ] `openssl rand -base64 32` → `BETTER_AUTH_SECRET`
- [ ] Google Cloud OAuth client → `GOOGLE_CLIENT_ID/SECRET` (redirect: `https://jellocello30.github.io/thicket/api/auth/callback/google`)
- [ ] Resend + domain verification (SPF/DKIM) → `RESEND_API_KEY`
- [ ] Anthropic → `ANTHROPIC_API_KEY`; Voyage → `VOYAGE_API_KEY`
- [ ] Stripe: Pro product ($8/mo, $72/yr prices), webhook endpoint, Customer Portal on
      → `STRIPE_*` vars
- [ ] Optional: Sentry DSN(s), PostHog key

## 2. Legal (needs your judgment)

- [ ] Fill every `[CUSTOMIZE]` in `/privacy` and `/terms` (entity name, governing law,
      processor list, effective dates) — grep the repo for `CUSTOMIZE`
- [ ] Counsel review for your jurisdictions
- [ ] Create support@ / privacy@ / security@ jellocello30.github.io/thicket aliases

## 3. Deploy web (~30 min)

- [ ] Vercel project (root `apps/web`), all env vars, deploy — see docs/DEPLOY.md
- [ ] Point jellocello30.github.io/thicket DNS at Vercel
- [ ] Smoke: magic-link login end-to-end, `/pricing` checkout in Stripe test mode,
      webhook shows 200s in the Stripe dashboard, then switch to live keys

## 4. Publish extension (~30 min + review wait)

- [ ] Chrome Web Store developer account ($5)
- [ ] Upload `apps/extension/release/thicket-0.1.0.zip` with the listing kit in
      docs/CHROME_WEB_STORE.md (copy, screenshots, privacy disclosures are ready)
- [ ] After approval: put the assigned ID into `THICKET_EXTENSION_IDS` (Vercel) and
      `chromeStoreUrl` in `packages/config/src/brand.ts`; redeploy

## 5. Verify the loop (15 min, with the store build)

- [ ] Install from the store → aha screen shows your real groups
- [ ] Save a group → close it → restore it
- [ ] Sign in → connect → workspace appears at jellocello30.github.io/thicket/app
- [ ] Upgrade with a real card → summaries/compare/semantic search unlock → refund yourself
- [ ] Delete a test account → confirm data is gone (per the delete-test-accounts rule)

## 6. Announce

- [ ] Product Hunt draft: the OG image (`apps/web/public/og.png`) and store screenshots
      are ready; lead with the aha ("42 tabs. 4 actual things.")
- [ ] Watch `/api/errors` + Sentry + Stripe radar the first week
