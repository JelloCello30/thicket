import { normalizeUrl, sanitizeForStorage } from "@thicket/core";
import { LIMITS } from "@thicket/config";
import type { ClosedTabRecord } from "@thicket/types";
import { readState, updateState, type LocalPage } from "../shared/storage";
import { faviconFor } from "./tabs";

/**
 * Page memory: a privacy-filtered record of pages Thicket has seen, so
 * closed tabs stay findable. Local ring buffer always; synced to the
 * account (via sync.ts) only when signed in with history+sync enabled.
 */

const lastKnown = new Map<number, { url: string; title: string; domain: string }>();

export async function recordVisit(
  tabId: number,
  url: string,
  title: string,
  incognito = false,
): Promise<void> {
  const { prefs, excludedDomains } = await readState("prefs", "excludedDomains");
  if (prefs.paused || !prefs.historyEnabled) return;

  /**
   * A private window is never observed. The privacy layer has always had the
   * guard, but the flag never reached it from here — so with "Allow in
   * Incognito" on, private URLs and titles were written to page memory while
   * the policy page said they were not. It is passed explicitly now.
   */
  const verdict = sanitizeForStorage(url, title, {
    excludedDomains: new Set(excludedDomains),
    incognito,
  });
  if (!verdict.ok) return;
  /**
   * An excluded site is excluded, full stop. This used to record the page
   * locally and merely refuse to SYNC it — a distinction that meant nothing
   * once there was no server, and that broke the promise Settings makes in so
   * many words: "never grouped, never remembered, never leave this device".
   * Excluding chase.com and then finding it in search, History, and the data
   * export is the single worst thing this extension could do.
   */
  if (verdict.sensitive) {
    lastKnown.delete(tabId);
    return;
  }

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

export async function recordClosed(tabId: number, groupName?: string, groupId?: string): Promise<void> {
  const known = lastKnown.get(tabId);
  lastKnown.delete(tabId);
  if (!known) return;
  // Callers that don't know the group (e.g. a manual ⌘W): look it up from
  // the last analysis so a later reopen can land back in the same group.
  if (!groupId) {
    const { readCached } = await import("./analyzer");
    const analysis = await readCached();
    const group = analysis?.groups.find((g) => g.tabIds.includes(tabId));
    if (group) {
      groupId = group.id;
      groupName = groupName ?? group.name;
    }
  }
  const record: ClosedTabRecord = {
    url: known.url,
    title: known.title,
    domain: known.domain,
    faviconUrl: faviconFor(known.url),
    closedAt: Date.now(),
    groupName,
    groupId,
  };
  await updateState("recentlyClosed", (closed) => {
    const next = [record, ...closed.filter((c) => c.url !== record.url)];
    next.length = Math.min(next.length, LIMITS.recentlyClosedKept);
    return next;
  });
  // Tell open UI surfaces right away — History should show a close instantly,
  // not whenever the next debounced analysis broadcasts.
  const { notifyUi } = await import("./analyzer");
  notifyUi();
}

export function knownTab(tabId: number): { url: string; title: string; domain: string } | undefined {
  return lastKnown.get(tabId);
}

/** Purge history beyond the retention window (free: 7d, pro: 90d; server mirrors this). */
export async function pruneHistory(retentionDays: number): Promise<void> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  await updateState("localHistory", (history) => history.filter((p) => p.lastSeenAt >= cutoff));
}

/**
 * Forget a single page everywhere: local page memory, recently-closed,
 * undo batches — and queue the server copy for deletion when signed in.
 */
export async function forgetPage(url: string): Promise<void> {
  const normalized = normalizeUrl(url);
  await updateState("localHistory", (history) =>
    history.filter((p) => p.normalizedUrl !== normalized),
  );
  await updateState("recentlyClosed", (closed) =>
    closed.filter((c) => normalizeUrl(c.url) !== normalized),
  );
  await updateState("closedBatches", (batches) =>
    batches
      .map((b) => ({ ...b, tabs: b.tabs.filter((t) => normalizeUrl(t.url) !== normalized) }))
      .filter((b) => b.tabs.length > 0),
  );
  await updateState("pendingPageDeletes", (queue) =>
    queue.includes("*") || queue.includes(normalized) ? queue : [...queue, normalized],
  );
  const { flushPageDeletes } = await import("./sync");
  void flushPageDeletes();
}

/** Clear all history: page memory, closed records, batches — and the synced copy. */
export async function clearHistory(): Promise<void> {
  const { writeState } = await import("../shared/storage");
  await writeState({
    localHistory: [],
    recentlyClosed: [],
    closedBatches: [],
    pendingPageDeletes: ["*"],
  });
  const { flushPageDeletes } = await import("./sync");
  void flushPageDeletes();
}

/** Wipe everything Thicket remembers locally (Delete My Data). */
export async function wipeLocalData(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  lastKnown.clear();
}
