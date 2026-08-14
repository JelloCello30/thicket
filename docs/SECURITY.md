# Security & privacy architecture

## Threat model priorities

A tab manager's worst failures are (1) leaking browsing activity, (2) leaking secrets
embedded in URLs, (3) account takeover via the extension bridge, (4) entitlement bypass.

## Data handling

- **Never stored, anywhere:** incognito tabs, browser-internal pages, sign-in/OAuth/2FA
  flows, checkout/payment pages, secret-looking URL params (token/key/session/otp… —
  stripped before storage), token-bearing hash fragments.
- **Local only, never off-device:** sites on the built-in sensitive list (banking,
  brokerage, healthcare, credit bureaus, password managers, IdP login hosts) and
  user-excluded domains. Enforced in `packages/core/src/privacy.ts`, re-enforced
  server-side on ingest (`/api/sync/pages` re-sanitizes; excerpts stripped unless the
  account has content-analysis on).
- **Retention:** page memory expires server-side (7d free / 90d pro) via a daily cron;
  the same windows bound search. Local extension history prunes on the same schedule.
- **Deletion:** account delete cancels Stripe, deletes the user row; every table cascades
  by foreign key (verified by test). Export is one JSON endpoint.

## AuthN / AuthZ

- Sessions: Better Auth (HTTP-only cookies, 30-day expiry) for the web app.
- Extension: bearer device tokens — 32 random bytes, stored as SHA-256, revocable
  per device, self-revoked on sign-out. Link codes are single-use, 10-minute TTL, hashed.
- Every API route resolves a `RequestUser` and checks ownership on the rows it touches;
  workspace writes verify ownership *before* any other logic.
- Entitlements resolve from the subscriptions table on every request; the Stripe webhook
  (signature-verified, idempotent by event id, retry-safe) is its only writer.

## Web hardening

- zod validation on every request body/query; bounded sizes throughout.
- Parameterized queries only (Drizzle); no string SQL with user input.
- CORS: extension endpoints echo only `chrome-extension://` origins on the configured
  ID allowlist (any extension origin in dev). No wildcard.
- Security headers: nosniff, DENY framing, strict referrer, minimal permissions-policy.
- Rate limits per user on AI/sync/search/events; durable daily AI caps.
- Stripe: raw-body signature verification; no amounts trusted from the client.
- Secrets only in env; `serverEnv()` validates at boot and refuses production without
  the required set. No AI keys ever ship to the browser or extension.

## Extension hardening

- Minimum permissions; no host permissions by default. `<all_urls>` is an *optional*
  permission requested only when the user enables content analysis, and content capture
  is a one-shot function injection (no persistent content scripts).
- `externally_connectable` restricted to tabmind.app + localhost; the only externally
  triggerable actions are link-code redemption and a version ping.
- Messages from web pages can't reach the internal router (typed router ignores
  non-request messages; external listener handles only the two known types).
- The dashboard renders only extension-owned data; favicons load via Chrome's internal
  favicon service, not third-party favicon APIs.

## Reporting

security@tabmind.app — [CUSTOMIZE: set up this alias before launch.]
