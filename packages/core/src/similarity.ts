import type { AnalyzedTab, SiteCategory } from "@tabmind/types";
import { HUB_CATEGORIES } from "./sites";
import { tokenize } from "./text";
import { tabThemes, type Theme } from "./themes";

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
  tokenSet: Set<string>;
  entityTokens: Set<string>;
  queryTokens: string[];
}

export function featuresFor(tabs: AnalyzedTab[]): TabFeatures[] {
  return tabs.map((tab) => ({
    tab,
    themes: tabThemes(tab),
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

function isHubSite(domain: string, category: SiteCategory): boolean {
  return HUB_CATEGORIES.has(category) || HUB_DOMAINS.has(domain);
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

  let score = 0;

  // Same site is a strong signal — unless it's a hub, where two tabs can
  // serve totally unrelated intents (two subreddits, two YouTube videos).
  if (a.domain && a.domain === b.domain) {
    const hub = isHubSite(a.domain, a.category) || isHubSite(b.domain, b.category);
    if (hub) {
      score += 0.08;
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

  // Shared activity theme (travel, apartment hunt, camera research…).
  let sharedTheme = false;
  for (const t of fa.themes) {
    if (fb.themes.has(t)) {
      sharedTheme = true;
      break;
    }
  }
  if (sharedTheme) score += 0.3;

  // Title vocabulary, weighted by how often tokens recur across the session.
  score += 0.38 * weightedCosine(fa.tokenSet, fb.tokenSet, ctx.tokenDf);

  const incompatible = categoriesIncompatible(a.category, b.category);

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
    score += 0.35 * (inter / (ea.size + eb.size - inter));
  }

  // Weak spatial hint.
  if (a.windowId === b.windowId) score += 0.03;

  score += boostFor(a, b, ctx.pairBoosts);

  return Math.max(0, Math.min(1, score));
}
