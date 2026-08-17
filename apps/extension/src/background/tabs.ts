import type { TabSnapshot } from "@thicket/types";

/**
 * Tab collection + focus bookkeeping. Chrome 121+ reports `lastAccessed`;
 * we also track activations ourselves so staleness works immediately.
 */

const focusTimes = new Map<number, number>();

export function noteActivated(tabId: number): void {
  focusTimes.set(tabId, Date.now());
}

export function noteRemoved(tabId: number): void {
  focusTimes.delete(tabId);
}

export async function collectTabs(): Promise<TabSnapshot[]> {
  const tabs = await chrome.tabs.query({ windowType: "normal" });
  const snapshots: TabSnapshot[] = [];
  for (const tab of tabs) {
    if (tab.id == null || tab.windowId == null) continue;
    snapshots.push({
      id: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      url: tab.url ?? "",
      title: tab.title ?? "",
      favIconUrl: tab.favIconUrl,
      pinned: tab.pinned,
      active: tab.active,
      audible: tab.audible,
      openerTabId: tab.openerTabId,
      groupId: tab.groupId,
      lastAccessed: focusTimes.get(tab.id) ?? tab.lastAccessed,
      incognito: tab.incognito,
      discarded: tab.discarded,
    });
  }
  return snapshots;
}

/** Extension-page favicon service; no network, no external requests. */
export function faviconFor(url: string, size = 32): string {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url);
  u.searchParams.set("size", String(size));
  return u.toString();
}
