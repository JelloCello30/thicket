import type { AnalyzedTab, SiteCategory } from "@thicket/types";
import { HUB_CATEGORIES } from "./sites";
import { tokenize } from "./text";
import { tabEvidenceThemes, tabThemes, type Theme } from "./themes";

export interface PairBoost {
  /** Registrable domains. */
  a: string;
  b: string;
  /** Positive pulls together, negative pushes apart. Typically ±0.3. */
  delta: number;
}

export interface SimilarityContext {
  /** Learned adjustments from user corrections (domain-level). */
  pairBoosts?: PairBoost[];
  /**
   * Session-level token document frequency. Tokens recurring across many open
   * tabs ("pricing", "tokyo", "acme") are activity markers and weigh more.
   */
  tokenDf?: Map<string, number>;
}

export interface TabFeatures {
  tab: AnalyzedTab;
  themes: Set<Theme>;
  /** Themes the TITLE evidences, not merely ones the category implies. */
  evidenceThemes: Set<Theme>;
  tokenSet: Set<string>;
  entityTokens: Set<string>;
  queryTokens: string[];
}

export function featuresFor(tabs: AnalyzedTab[]): TabFeatures[] {
  return tabs.map((tab) => ({
    tab,
    themes: tabThemes(tab),
    evidenceThemes: tabEvidenceThemes(tab),
    tokenSet: new Set(tab.tokens),
    entityTokens: new Set(tokenize(tab.entities.join(" "))),
    queryTokens: tab.searchQuery ? tokenize(tab.searchQuery) : [],
  }));
}

/** Doc frequency of tokens across a session's non-excluded tabs. */
export function sessionTokenDf(features: TabFeatures[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const f of features) {
    if (f.tab.excluded) continue;
    for (const t of f.tokenSet) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return df;
}

/**
 * Sites where two tabs on the same domain can serve unrelated intents:
 * search engines, mail, AI chat, social feeds, forums, video platforms,
 * and multi-product domains like google.com.
 */
const HUB_DOMAINS = new Set(["google.com", "youtube.com", "reddit.com", "wikipedia.org", "x.com", "twitter.com"]);

/**
 * Domains that host many unrelated projects, products, or papers, where the
 * leading path segments — not the hostname — say what you're looking at.
 * Two GitHub pull requests are only the same work if they're the same repo;
 * two Amazon pages are only the same shopping if they're the same product.
 * Without this, the flat same-domain bonus (0.42) alone clears the union bar
 * and fuses every unrelated thing a user has open on one big site.
 */
const MULTI_TOPIC_DOMAINS = new Set([
  // Code hosts: the owner/repo path IS the project.
  "github.com", "gitlab.com", "bitbucket.org",
  // Paper hosts: each path is a different paper on a different subject.
  "arxiv.org",
  // Marketplaces: each path is a different product.
  "amazon.com", "ebay.com", "etsy.com", "walmart.com", "target.com", "bestbuy.com",
  "homedepot.com", "lowes.com", "wayfair.com", "newegg.com",
]);
/*
 * Deliberately NOT listed: travel aggregators (kayak, booking, airbnb, expedia)
 * and work tools (figma, linear, notion, atlassian). On those, two different
 * paths are usually still the SAME activity — three Kayak searches are one trip
 * being planned. Listing them split the fixture's Tokyo trip into a 10-tab group
 * plus a rival 2-tab "Research" group, which is the very bug this file fights.
 */

/** The path prefix that identifies WHICH thing on a multi-topic site. */
function topicPath(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean).slice(0, 2);
    return segments.join("/").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Hub-ness is a property of the HOSTNAME, not the registrable domain.
 * google.com is a hub — two results there share nothing. docs.google.com is a
 * single tool, and lumping it in meant a user's own documents scored as
 * unrelated to each other and never condensed.
 */
function isHubSite(tab: Pick<AnalyzedTab, "domain" | "hostname" | "category">): boolean {
  if (tab.hostname && HUB_DOMAINS.has(tab.domain) && !HUB_DOMAINS.has(tab.hostname)) {
    // A subdomain of a hub that is its own product (docs./mail./drive.) is not
    // itself a hub; the bare host and its www form are.
    const bare = tab.hostname.replace(/^www\./, "");
    if (bare !== tab.domain) return HUB_CATEGORIES.has(tab.category);
  }
  return HUB_CATEGORIES.has(tab.category) || HUB_DOMAINS.has(tab.domain);
}

/** Categories that behave as one "work suite" for clustering. */
const WORK_SUITE = new Set<SiteCategory>(["work", "docs", "dev"]);

/** Categories that can plausibly serve any activity (forums, wikis, video…). */
const WILDCARD_CATEGORIES = new Set<SiteCategory>([
  "other",
  "search",
  "discussion",
  "reference",
  "media",
  "social",
  "news",
  "reading",
  "ai",
]);

/**
 * Two tabs with *different specific* categories (travel vs realestate) are
 * evidence AGAINST same intent — a shared hometown token must not glue a
 * flight search to an apartment listing.
 */
function categoriesIncompatible(a: SiteCategory, b: SiteCategory): boolean {
  if (a === b) return false;
  if (WILDCARD_CATEGORIES.has(a) || WILDCARD_CATEGORIES.has(b)) return false;
  if (WORK_SUITE.has(a) && WORK_SUITE.has(b)) return false;
  return true;
}

function weightedCosine(
  a: Set<string>,
  b: Set<string>,
  df: Map<string, number> | undefined,
): number {
  if (a.size === 0 || b.size === 0) return 0;
  const w = (t: string): number => {
    const n = df?.get(t) ?? 1;
    return n >= 4 ? 2 : n === 3 ? 1.7 : n === 2 ? 1.25 : 1;
  };
  let dot = 0;
  for (const t of a) if (b.has(t)) dot += w(t) * w(t);
  let magA = 0;
  for (const t of a) magA += w(t) * w(t);
  let magB = 0;
  for (const t of b) magB += w(t) * w(t);
  return dot / Math.sqrt(magA * magB);
}

function plainCosine(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.sqrt(sa.size * sb.size);
}

function boostFor(a: AnalyzedTab, b: AnalyzedTab, boosts?: PairBoost[]): number {
  if (!boosts || boosts.length === 0) return 0;
  let total = 0;
  for (const boost of boosts) {
    const match =
      (a.domain === boost.a && b.domain === boost.b) ||
      (a.domain === boost.b && b.domain === boost.a);
    if (match) total += boost.delta;
  }
  return total;
}

/**
 * How likely two open tabs belong to the same human intention. 0..1.
 * Deterministic, explainable, and fast — this runs on every re-analysis.
 */
export function pairScore(fa: TabFeatures, fb: TabFeatures, ctx: SimilarityContext = {}): number {
  const a = fa.tab;
  const b = fb.tab;
  if (a.excluded || b.excluded) return 0;

  // The same page open twice is the same intention, full stop — except on hub
  // apps, where routing lives in fragments and query strings that normalization
  // flattens. Two Gmail views are not "the same page"; treating them as proof
  // fuses unrelated mail tabs into a meaningless group.
  if (
    a.normalizedUrl &&
    a.normalizedUrl === b.normalizedUrl &&
    !isHubSite(a) &&
    !isHubSite(b)
  ) {
    return 1;
  }

  let score = 0;

  // Same site is a strong signal — unless it's a hub, where two tabs can
  // serve totally unrelated intents (two subreddits, two YouTube videos).
  if (a.domain && a.domain === b.domain) {
    const hub = isHubSite(a) || isHubSite(b);
    if (hub) {
      score += 0.08;
    } else if (MULTI_TOPIC_DOMAINS.has(a.domain)) {
      // Same big site, but is it the same THING on it? Same repo, product, or
      // paper is as strong as any same-site signal; a different one is barely
      // evidence at all, and the titles have to earn the link.
      const samePath = topicPath(a.url) === topicPath(b.url);
      score += samePath ? 0.42 : 0.1;
    } else if (a.siteName === b.siteName) {
      score += 0.42;
    } else {
      score += 0.15; // same ecosystem, different product (Docs vs Sheets)
    }
  } else if (
    a.category !== "other" &&
    a.category === b.category &&
    !HUB_CATEGORIES.has(a.category)
  ) {
    score += 0.2;
  } else if (WORK_SUITE.has(a.category) && WORK_SUITE.has(b.category)) {
    score += 0.2;
  }

  // One tab opened from the other. A real click-through is strong evidence,
  // but browsers also assign openers to tabs that merely opened next to each
  // other — so a bare opener edge is persuasive (0.3), decisive only when the
  // categories agree (+0.2). Uncorroborated cross-context edges stay below
  // the union threshold instead of daisy-chaining unrelated activities.
  if (a.openerTabId === b.tabId || b.openerTabId === a.tabId) {
    score += categoriesIncompatible(a.category, b.category) ? 0.3 : 0.5;
  }

  // Same search intent: overlapping queries, or a query matching a page title
  // (the search that led to this session of tabs).
  let querySignal = 0;
  if (fa.queryTokens.length > 0 && fb.queryTokens.length > 0) {
    querySignal = 0.55 * plainCosine(fa.queryTokens, fb.queryTokens);
  }
  if (fa.queryTokens.length > 0) {
    querySignal = Math.max(querySignal, 0.45 * plainCosine(fa.queryTokens, [...fb.tokenSet]));
  }
  if (fb.queryTokens.length > 0) {
    querySignal = Math.max(querySignal, 0.45 * plainCosine(fb.queryTokens, [...fa.tokenSet]));
  }
  score += querySignal;

  /**
   * Shared activity theme (travel, apartment hunt, camera research…).
   * At least one side must EVIDENCE the theme in its title: when both tabs
   * merely inherit it from their category, the same-category bonus above has
   * already paid for that fact, and paying twice fused every pair of trips
   * (0.53, over the union bar) without a shred of topical agreement.
   */
  let sharedTheme = false;
  for (const t of fa.themes) {
    if (!fb.themes.has(t)) continue;
    if (fa.evidenceThemes.has(t) || fb.evidenceThemes.has(t)) {
      sharedTheme = true;
      break;
    }
  }
  if (sharedTheme) score += 0.3;

  const incompatible = categoriesIncompatible(a.category, b.category);

  /**
   * Shared vocabulary and shared entities are precisely the signals a common
   * place or brand name inflates: "Los Angeles" appears in an apartment
   * listing and in a flight search, "Sony" in a camera review and a TV deal.
   * When two pages serve different intents AND agree on no activity theme,
   * distrust those signals — otherwise a city name chains a lease to a plane
   * ticket. A shared theme means the ACTIVITY matches, which outranks the
   * site-type mismatch, so it lifts the damping entirely.
   */
  const topicalDamping = incompatible && !sharedTheme ? 0.45 : 1;

  // Title vocabulary, weighted by how often tokens recur across the session.
  score += 0.38 * weightedCosine(fa.tokenSet, fb.tokenSet, ctx.tokenDf) * topicalDamping;

  // Project keywords: tokens recurring across ≥3 open tabs ("pricing",
  // "acme") mark an activity. Shared ones are strong glue — but only between
  // tabs whose categories BOTH commit to an activity. Wildcard pages (search,
  // forums, video) must earn their links through queries and entities, or a
  // hometown token would chain every project together.
  const bothSpecific = !WILDCARD_CATEGORIES.has(a.category) && !WILDCARD_CATEGORIES.has(b.category);
  if (!incompatible && bothSpecific && ctx.tokenDf) {
    let mass = 0;
    for (const t of fa.tokenSet) {
      if (!fb.tokenSet.has(t)) continue;
      const df = ctx.tokenDf.get(t) ?? 1;
      if (df >= 3) mass += df >= 4 ? 4 : 2.9;
    }
    score += Math.min(0.24, mass * 0.05);
  }
  if (incompatible) score -= 0.08;

  // Named entities compared at token level: "Tokyo October" ↔ "Tokyo" counts.
  const ea = fa.entityTokens;
  const eb = fb.entityTokens;
  if (ea.size > 0 && eb.size > 0) {
    let inter = 0;
    for (const t of ea) if (eb.has(t)) inter++;
    score += 0.35 * (inter / (ea.size + eb.size - inter)) * topicalDamping;
  }

  // Weak spatial hint.
  if (a.windowId === b.windowId) score += 0.03;

  score += boostFor(a, b, ctx.pairBoosts);

  // Near-identical titles are the same topic even across sites (a syndicated
  // article, a listing on two portals, a doc and its preview). This must beat
  // every union threshold — "same title, different group" is indefensible.
  if (fa.tokenSet.size >= 2 && fb.tokenSet.size >= 2) {
    let inter = 0;
    for (const t of fa.tokenSet) if (fb.tokenSet.has(t)) inter++;
    const jaccard = inter / (fa.tokenSet.size + fb.tokenSet.size - inter);
    // Containment as well as symmetry: one retailer writes "Breville Barista
    // Express Espresso Machine" and another writes only the product name, so
    // the shorter title is a strict subset of the longer. Symmetric overlap
    // scores that pair too low and splits one product across two groups.
    const smaller = Math.min(fa.tokenSet.size, fb.tokenSet.size);
    const containment = inter / smaller;
    if (jaccard >= 0.8 || (smaller >= 3 && containment >= 0.9)) score = Math.max(score, 0.85);
  }

  return Math.max(0, Math.min(1, score));
}
