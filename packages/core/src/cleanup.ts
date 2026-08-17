import type { AnalyzedTab, CleanupCandidate, CleanupPlan, CleanupReason } from "@thicket/types";
import { STALENESS } from "@thicket/config";
import { isNewTabPage } from "./url";

/** Exact duplicates by normalized URL. The most recently used copy stays. */
export function findDuplicates(tabs: AnalyzedTab[]): CleanupCandidate[] {
  const byUrl = new Map<string, AnalyzedTab[]>();
  for (const tab of tabs) {
    if (tab.excluded || !tab.normalizedUrl) continue;
    const arr = byUrl.get(tab.normalizedUrl) ?? [];
    arr.push(tab);
    byUrl.set(tab.normalizedUrl, arr);
  }
  const out: CleanupCandidate[] = [];
  for (const copies of byUrl.values()) {
    if (copies.length < 2) continue;
    const keep = copies.reduce((best, t) => {
      if (t.pinned && !best.pinned) return t;
      if (best.pinned && !t.pinned) return best;
      if (t.active) return t;
      if (best.active) return best;
      return (t.lastAccessed ?? 0) >= (best.lastAccessed ?? 0) ? t : best;
    });
    for (const t of copies) {
      if (t.tabId === keep.tabId) continue;
      out.push({
        tabId: t.tabId,
        url: t.url,
        title: t.title,
        domain: t.domain,
        reason: "duplicate",
        duplicateOfTabId: keep.tabId,
      });
    }
  }
  return out;
}

export interface CleanupContext {
  /** Normalized URLs already saved into workspaces. */
  savedUrls?: ReadonlySet<string>;
}

/**
 * Everything that could safely close, with reasons. Never touches pinned,
 * active, or audible tabs. The caller shows this plan before acting.
 */
export function buildCleanupPlan(tabs: AnalyzedTab[], ctx: CleanupContext = {}): CleanupPlan {
  const candidates: CleanupCandidate[] = [];
  const taken = new Set<number>();
  const push = (c: CleanupCandidate) => {
    if (taken.has(c.tabId)) return;
    taken.add(c.tabId);
    candidates.push(c);
  };

  for (const dup of findDuplicates(tabs)) push(dup);

  for (const tab of tabs) {
    if (tab.pinned || tab.active || tab.audible) continue;
    if (isNewTabPage(tab.url, tab.title)) {
      push({ tabId: tab.tabId, url: tab.url, title: tab.title || "New tab", domain: "", reason: "newtab" });
      continue;
    }
    if (tab.excluded) continue;
    if (ctx.savedUrls?.has(tab.normalizedUrl) && tab.staleness >= 0.4) {
      push({ tabId: tab.tabId, url: tab.url, title: tab.title, domain: tab.domain, reason: "saved" });
      continue;
    }
    if (tab.staleness >= STALENESS.cleanupThreshold) {
      push({ tabId: tab.tabId, url: tab.url, title: tab.title, domain: tab.domain, reason: "stale" });
    }
  }

  const counts: Record<CleanupReason, number> = { duplicate: 0, stale: 0, newtab: 0, saved: 0 };
  for (const c of candidates) counts[c.reason]++;
  const order: Record<CleanupReason, number> = { duplicate: 0, newtab: 1, saved: 2, stale: 3 };
  candidates.sort((a, b) => order[a.reason] - order[b.reason] || a.domain.localeCompare(b.domain));
  return { candidates, counts };
}
