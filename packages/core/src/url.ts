/** URL understanding: normalization, identity, and domain extraction. */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gclsrc",
  "dclid",
  "fbclid",
  "igshid",
  "twclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "yclid",
  "ttclid",
  "srsltid",
  "ref",
  "ref_",
  "ref_src",
  "referrer",
  "_hsenc",
  "_hsmi",
  "vero_id",
  "oly_anon_id",
  "oly_enc_id",
  "s_kwcid",
  "spm",
  "sc_channel",
]);

/** Multi-part public suffixes we care about for registrable-domain extraction. */
const MULTIPART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.kr",
  "com.br",
  "com.mx",
  "com.ar",
  "co.in",
  "com.sg",
  "com.hk",
  "com.tw",
  "co.za",
  "com.tr",
]);

export function isHttpUrl(raw: string): boolean {
  return raw.startsWith("http://") || raw.startsWith("https://");
}

export function isBrowserInternal(raw: string): boolean {
  return (
    !raw ||
    raw.startsWith("chrome://") ||
    raw.startsWith("chrome-extension://") ||
    raw.startsWith("edge://") ||
    raw.startsWith("brave://") ||
    raw.startsWith("arc://") ||
    raw.startsWith("about:") ||
    raw.startsWith("view-source:") ||
    raw.startsWith("devtools://") ||
    raw.startsWith("file://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:")
  );
}

export function isNewTabPage(raw: string, title?: string): boolean {
  if (!raw) return true;
  if (raw === "chrome://newtab/" || raw === "about:blank" || raw === "about:newtab") return true;
  if (raw.startsWith("chrome://new-tab-page")) return true;
  if (title && title.trim().toLowerCase() === "new tab" && raw.startsWith("chrome://")) return true;
  return false;
}

/** Registrable domain: "www.blog.zillow.com" → "zillow.com", "news.bbc.co.uk" → "bbc.co.uk". */
export function getDomain(raw: string): string {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
    if (/^[\d.]+$/.test(host) || host === "localhost") return host;
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const lastTwo = parts.slice(-2).join(".");
    if (MULTIPART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }
    return lastTwo;
  } catch {
    return "";
  }
}

export function getHostname(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Canonical identity for a page: strips tracking params, hash, default ports,
 * trailing slash, and "www.". Two tabs with equal normalized URLs are duplicates.
 */
export function normalizeUrl(raw: string): string {
  if (!isHttpUrl(raw)) return raw;
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
      u.port = "";
    }
    const kept: [string, string][] = [];
    for (const [key, value] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) kept.push([key, value]);
    }
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
    u.search = "";
    for (const [key, value] of kept) u.searchParams.append(key, value);
    let out = u.toString();
    if (u.pathname === "/" && !u.search) out = out.replace(/\/$/, "");
    return out;
  } catch {
    return raw;
  }
}

const SERP_HOSTS: Record<string, string> = {
  "google.com": "q",
  "bing.com": "q",
  "duckduckgo.com": "q",
  "kagi.com": "q",
  "search.brave.com": "q",
  "ecosia.org": "q",
  "startpage.com": "query",
};

/** If the tab is a search-results page, return the query. */
export function getSearchQuery(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    for (const [serp, param] of Object.entries(SERP_HOSTS)) {
      if (host === serp || host.endsWith(`.${serp}`)) {
        // Google puts non-search products on subpaths; /search and root are SERPs.
        if (serp === "google.com" && !(u.pathname === "/search" || u.pathname === "/")) return undefined;
        const q = u.searchParams.get(param)?.trim();
        return q && q.length > 0 && q.length <= 200 ? q : undefined;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
