import { normalizeUrl, sanitizeForStorage } from "@tabmind/core";
import { LIMITS } from "@tabmind/config";
import type { ClosedTabRecord } from "@tabmind/types";
import { readState, updateState, type LocalPage } from "../shared/storage";
import { faviconFor } from "./tabs";

/**
 * Page memory: a privacy-filtered record of pages TabMind has seen, so
 * closed tabs stay findable. Local ring buffer always; synced to the
 * account (via sync.ts) only when signed in with history+sync enabled.
 */

const lastKnown = new Map<number, { url: string; title: string; domain: string }>();

export async function recordVisit(tabId: number, url: string, title: string): Promise<void> {
  const { prefs, excludedDomains } = await readState("prefs", "excludedDomains");
  if (prefs.paused || !prefs.historyEnabled) return;

  const verdict = sanitizeForStorage(url, title, {
    excludedDomains: new Set(excludedDomains),
  });
  if (!verdict.ok) return;

  const normalized = normalizeUrl(verdict.url);
  const domain = new URL(verdict.url).hostname.replace(/^www\./, "");
  lastKnown.set(tabId, { url: verdict.url, title: verdict.title, domain });

  // Sensitive pages stay visible to the user locally but are never synced.
  await updateState("localHistory", (history) => {
    const existing = history.find((p) => p.normalizedUrl === normalized);
    const now = Date.now();
    if (existing) {
      existing.lastSeenAt = now;
      existing.visits += 1;
      existing.title = verdict.title || existing.title;
      existing.pendingSync = existing.pendingSync || !verdict.sensitive;
      return [...history];
    }
    const entry: LocalPage = {
      url: verdict.url,
      normalizedUrl: normalized,
      title: verdict.title,
      domain,
      faviconUrl: faviconFor(verdict.url),
      firstSeenAt: now,
      lastSeenAt: now,
      visits: 1,
      pendingSync: !verdict.sensitive,
    };
    const next = [...history, entry];
    // Ring buffer: drop the oldest beyond the cap.
    if (next.length > LIMITS.localHistoryMax) {
      next.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      next.length = LIMITS.localHistoryMax;
    }
    return next;
  });
}

export async function recordClosed(tabId: number, groupName?: string): Promise<void> {
  const known = lastKnown.get(tabId);
  lastKnown.delete(tabId);
  if (!known) return;
  const record: ClosedTabRecord = {
    url: known.url,
    title: known.title,
    domain: known.domain,
    faviconUrl: faviconFor(known.url),
    closedAt: Date.now(),
    groupName,
  };
  await updateState("recentlyClosed", (closed) => {
    const next = [record, ...closed.filter((c) => c.url !== record.url)];
    next.length = Math.min(next.length, LIMITS.recentlyClosedKept);
    return next;
  });
}

export function knownTab(tabId: number): { url: string; title: string; domain: string } | undefined {
  return lastKnown.get(tabId);
}

/** Purge history beyond the retention window (free: 7d, pro: 90d; server mirrors this). */
export async function pruneHistory(retentionDays: number): Promise<void> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  await updateState("localHistory", (history) => history.filter((p) => p.lastSeenAt >= cutoff));
}

/** Wipe everything TabMind remembers locally (Delete My Data). */
export async function wipeLocalData(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  lastKnown.clear();
}
