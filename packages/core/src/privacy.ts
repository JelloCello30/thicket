import { getDomain, getHostname, isBrowserInternal, isHttpUrl } from "./url";

/**
 * The privacy layer. Everything that decides "this never leaves the device"
 * or "this is never even stored" lives here, in one auditable file.
 *
 * Rules, in order of severity:
 *  1. NEVER STORE: incognito tabs, browser-internal pages, auth/payment flows,
 *     URLs carrying credentials or secret-looking params.
 *  2. STORE LOCALLY, NEVER SYNC/AI: user-excluded domains, default-sensitive
 *     categories (banking, healthcare, government).
 *  3. STRIP: secret-looking query params are removed before anything is stored.
 */

const SENSITIVE_PARAM_PATTERNS = [
  /^(auth|access|id|session|refresh)?[-_]?token$/i,
  /^(api[-_]?key|apikey|key|secret|signature|sig)$/i,
  /^(password|passwd|pwd|otp|pin|cvv)$/i,
  /^(code|oauth_token|oauth_verifier|id_token|assertion|saml(response)?)$/i,
  /^(session|sessionid|session_id|sid|phpsessid|jsessionid)$/i,
  /^(email|e?mail_address|phone|tel|ssn)$/i,
  /^(reset|verification|confirm(ation)?)[-_]?(code|token|key)?$/i,
];

const AUTH_PATH_PATTERNS = [
  /\/(log[-_]?in|sign[-_]?in|sign[-_]?up|register|authenticate|authorize|oauth2?|sso|saml|openid)([/?#]|$)/i,
  /\/(password[-_]?reset|reset[-_]?password|forgot[-_]?password|verify[-_]?email|magic[-_]?link)([/?#]|$)/i,
  /\/(two[-_]?factor|2fa|mfa|otp)([/?#]|$)/i,
];

const PAYMENT_PATH_PATTERNS = [
  /\/(checkout|payment|billing\/(payment|card)|pay|cart\/checkout)([/?#]|$)/i,
  /\/(add|update)[-_]?(card|payment[-_]?method)([/?#]|$)/i,
];

/** Categories of sites that are locally visible but never synced or sent to AI by default. */
const DEFAULT_SENSITIVE_DOMAINS = new Set([
  // US banking + finance
  "bankofamerica.com",
  "chase.com",
  "wellsfargo.com",
  "citi.com",
  "citibank.com",
  "capitalone.com",
  "usbank.com",
  "pnc.com",
  "truist.com",
  "ally.com",
  "discover.com",
  "amex.com",
  "americanexpress.com",
  "fidelity.com",
  "schwab.com",
  "vanguard.com",
  "etrade.com",
  "robinhood.com",
  "wealthfront.com",
  "betterment.com",
  "sofi.com",
  "chime.com",
  "venmo.com",
  "cash.app",
  "paypal.com",
  "wise.com",
  "coinbase.com",
  "kraken.com",
  "creditkarma.com",
  "experian.com",
  "equifax.com",
  "transunion.com",
  "irs.gov",
  "ssa.gov",
  "studentaid.gov",
  // healthcare
  "mychart.com",
  "mychart.org",
  "myquest.questdiagnostics.com",
  "labcorp.com",
  "zocdoc.com",
  "goodrx.com",
  "healthcare.gov",
  "kaiserpermanente.org",
  "anthem.com",
  "cigna.com",
  "aetna.com",
  "uhc.com",
  "cvs.com",
  "walgreens.com",
  "23andme.com",
  "ancestry.com",
  // password managers / auth
  "1password.com",
  "lastpass.com",
  "bitwarden.com",
  "dashlane.com",
  "accounts.google.com",
  "login.microsoftonline.com",
  "appleid.apple.com",
  "id.apple.com",
]);

export type SanitizeVerdict =
  | { ok: true; url: string; title: string; sensitive: boolean }
  | { ok: false; reason: "internal" | "auth-flow" | "payment" | "invalid" };

/** Strip secret-looking query params from a URL that is otherwise fine to keep. */
export function stripSensitiveParams(raw: string): string {
  if (!isHttpUrl(raw)) return raw;
  try {
    const u = new URL(raw);
    const toDelete: string[] = [];
    for (const key of u.searchParams.keys()) {
      if (SENSITIVE_PARAM_PATTERNS.some((p) => p.test(key))) toDelete.push(key);
    }
    for (const key of toDelete) u.searchParams.delete(key);
    // A long opaque hash fragment is often a token (e.g. #access_token=...).
    if (/[a-z_]*(token|key|secret|code)=/i.test(u.hash)) u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

export function isAuthFlowUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return AUTH_PATH_PATTERNS.some((p) => p.test(u.pathname));
  } catch {
    return false;
  }
}

export function isPaymentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return PAYMENT_PATH_PATTERNS.some((p) => p.test(u.pathname));
  } catch {
    return false;
  }
}

export function isDefaultSensitiveDomain(domain: string): boolean {
  if (DEFAULT_SENSITIVE_DOMAINS.has(domain)) return true;
  // Subdomain-qualified entries like accounts.google.com are matched by hostname elsewhere.
  return false;
}

function hostnameIsSensitive(raw: string): boolean {
  const host = getHostname(raw);
  return DEFAULT_SENSITIVE_DOMAINS.has(host);
}

export interface PrivacyContext {
  /** User-configured excluded domains (registrable domains, lowercase). */
  excludedDomains: ReadonlySet<string>;
  incognito?: boolean;
}

/**
 * Decide whether a page may be REMEMBERED at all, and clean it if so.
 * `sensitive: true` means: keep locally, but never sync and never send to AI.
 */
export function sanitizeForStorage(
  rawUrl: string,
  rawTitle: string,
  ctx: PrivacyContext,
): SanitizeVerdict {
  if (ctx.incognito) return { ok: false, reason: "internal" };
  if (isBrowserInternal(rawUrl) || !isHttpUrl(rawUrl)) return { ok: false, reason: "internal" };
  if (isAuthFlowUrl(rawUrl)) return { ok: false, reason: "auth-flow" };
  if (isPaymentUrl(rawUrl)) return { ok: false, reason: "payment" };

  const domain = getDomain(rawUrl);
  if (!domain) return { ok: false, reason: "invalid" };

  const sensitive =
    ctx.excludedDomains.has(domain) ||
    isDefaultSensitiveDomain(domain) ||
    hostnameIsSensitive(rawUrl);

  const url = stripSensitiveParams(rawUrl);
  const title = (rawTitle ?? "").slice(0, 500);
  return { ok: true, url, title, sensitive };
}

/** True when a tab may be included in server-side AI analysis or account sync. */
export function allowedOffDevice(verdict: SanitizeVerdict): boolean {
  return verdict.ok && !verdict.sensitive;
}

export function normalizeExcludedDomainInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const domain = getDomain(withScheme);
  if (!domain || !domain.includes(".")) return null;
  return domain;
}

export const __testing = { DEFAULT_SENSITIVE_DOMAINS };
