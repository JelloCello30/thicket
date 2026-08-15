import type { AnalyzedTab, TabSnapshot, UserPreferences } from "@tabmind/types";
import { getDomain, getHostname, getSearchQuery, isBrowserInternal, isNewTabPage, normalizeUrl } from "./url";
import { sanitizeForStorage, type PrivacyContext } from "./privacy";
import { lookupSite } from "./sites";
import { extractEntities, stripSiteSuffix, tokenize } from "./text";
import { stalenessScore } from "./staleness";

export interface AnalyzeContext {
  excludedDomains: ReadonlySet<string>;
  preferences: Pick<UserPreferences, "paused">;
  now: number;
  /** How long before a tab starts counting as done (user-tunable). */
  staleAfterHours?: number;
}

/** Turn a raw browser tab into an analyzed, privacy-filtered tab. Pure. */
export function analyzeTab(tab: TabSnapshot, ctx: AnalyzeContext): AnalyzedTab {
  const base: AnalyzedTab = {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    normalizedUrl: normalizeUrl(tab.url),
    title: tab.title || tab.url,
    domain: getDomain(tab.url),
    siteName: "",
    category: "other",
    tokens: [],
    entities: [],
    openerTabId: tab.openerTabId,
    chromeGroupId: tab.groupId != null && tab.groupId >= 0 ? tab.groupId : undefined,
    lastAccessed: tab.lastAccessed,
    pinned: tab.pinned,
    active: tab.active,
    audible: Boolean(tab.audible),
    staleness: 0,
    excluded: false,
  };

  if (ctx.preferences.paused) {
    return { ...base, excluded: true, excludedReason: "paused" };
  }
  if (tab.incognito) {
    return { ...base, url: "", normalizedUrl: "", title: "", excluded: true, excludedReason: "incognito" };
  }
  if (isBrowserInternal(tab.url) || isNewTabPage(tab.url, tab.title)) {
    return { ...base, excluded: true, excludedReason: "internal" };
  }

  const privacyCtx: PrivacyContext = { excludedDomains: ctx.excludedDomains };
  const verdict = sanitizeForStorage(tab.url, tab.title, privacyCtx);
  if (!verdict.ok) {
    return { ...base, excluded: true, excludedReason: "sensitive-url" };
  }
  if (verdict.sensitive) {
    // Visible locally but never leaves the device; also never grouped, so the
    // group payloads that sync stay clean.
    return { ...base, excluded: true, excludedReason: "excluded-domain" };
  }

  const hostname = getHostname(tab.url);
  const site = lookupSite(hostname, base.domain);
  const siteName = site?.name ?? prettifyDomain(base.domain);
  const category = site?.category ?? "other";
  const cleanTitle = stripSiteSuffix(verdict.title || base.title, siteName, base.domain);
  const searchQuery = getSearchQuery(tab.url);

  return {
    ...base,
    url: verdict.url,
    normalizedUrl: normalizeUrl(verdict.url),
    title: verdict.title || base.title,
    siteName,
    category,
    searchQuery,
    tokens: tokenize(searchQuery ? `${cleanTitle} ${searchQuery}` : cleanTitle),
    entities: extractEntities(cleanTitle),
    staleness: stalenessScore(tab, ctx.now, ctx.staleAfterHours),
  };
}

export function analyzeTabs(tabs: TabSnapshot[], ctx: AnalyzeContext): AnalyzedTab[] {
  return tabs.map((t) => analyzeTab(t, ctx));
}

export function prettifyDomain(domain: string): string {
  const stem = domain.replace(/\.(com|org|net|io|app|co|dev|ai|so|sh|me|tv|gg)(\.[a-z]{2})?$/, "");
  const first = stem.split(".")[0] ?? stem;
  return first.length <= 3 ? first.toUpperCase() : first[0]!.toUpperCase() + first.slice(1);
}
