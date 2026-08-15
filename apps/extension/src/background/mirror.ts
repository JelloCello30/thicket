import type { AnalysisResult, GroupColor } from "@tabmind/types";

/**
 * Mirror TabMind's groups onto native Chrome tab groups so the organization
 * is visible in the tab strip itself. We only ever touch groups we created
 * (tracked in session storage) — user-made groups are left alone.
 */

const COLOR_MAP: Record<GroupColor, chrome.tabGroups.ColorEnum> = {
  grey: "grey",
  blue: "blue",
  red: "red",
  yellow: "yellow",
  green: "green",
  pink: "pink",
  purple: "purple",
  cyan: "cyan",
  orange: "orange",
};

interface MirrorMap {
  /** analysis group id → chrome group id */
  [groupId: string]: number;
}

export async function readMirrorMap(): Promise<MirrorMap> {
  const raw = await chrome.storage.session.get("mirrorMap");
  return (raw.mirrorMap as MirrorMap | undefined) ?? {};
}

export async function mirrorGroups(result: AnalysisResult): Promise<void> {
  const mirrorMap = await readMirrorMap();
  const nextMap: MirrorMap = {};
  const byId = new Map(result.tabs.map((t) => [t.tabId, t]));

  // Any native group we didn't create is the user's. Its tabs are untouchable —
  // pulling them into a TabMind group would dismantle the user's own strip.
  const ours = new Set(Object.values(mirrorMap));
  const userGroupIds = new Set(
    (await chrome.tabGroups.query({})).map((g) => g.id).filter((id) => !ours.has(id)),
  );

  for (const group of result.groups) {
    if (group.isCatchAll) continue; // leave loose tabs loose
    if (group.nativeGroupId != null) continue; // the user's own group — already in the strip
    // Native groups are per-window; mirror within the dominant window.
    const members = group.tabIds
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t) && !t!.pinned)
      .filter((t) => t.chromeGroupId == null || !userGroupIds.has(t.chromeGroupId));
    if (members.length < 2) continue;
    const windowCounts = new Map<number, number>();
    for (const m of members) windowCounts.set(m.windowId, (windowCounts.get(m.windowId) ?? 0) + 1);
    const [windowId] = [...windowCounts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const tabIds = members.filter((m) => m.windowId === windowId).map((m) => m.tabId);
    if (tabIds.length < 2) continue;

    try {
      const existing = mirrorMap[group.id];
      let chromeGroupId: number;
      if (existing != null && (await groupStillExists(existing))) {
        const current = await chrome.tabs.query({ groupId: existing });
        const currentIds = new Set(current.map((t) => t.id));
        const toAdd = tabIds.filter((id) => !currentIds.has(id));
        if (toAdd.length > 0) {
          await chrome.tabs.group({ groupId: existing, tabIds: toAdd as [number, ...number[]] });
        }
        chromeGroupId = existing;
      } else {
        chromeGroupId = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] });
      }
      await chrome.tabGroups.update(chromeGroupId, {
        title: group.name,
        color: COLOR_MAP[group.color],
        collapsed: group.isStale ? true : undefined,
      });
      nextMap[group.id] = chromeGroupId;
    } catch {
      // Tab got closed mid-flight or window went away — next analysis fixes it.
    }
  }

  await chrome.storage.session.set({ mirrorMap: nextMap });
}

async function groupStillExists(chromeGroupId: number): Promise<boolean> {
  try {
    await chrome.tabGroups.get(chromeGroupId);
    return true;
  } catch {
    return false;
  }
}

/** Remove all TabMind-managed native groups (used when mirroring is turned off). */
export async function unmirrorAll(): Promise<void> {
  const mirrorMap = await readMirrorMap();
  for (const chromeGroupId of Object.values(mirrorMap)) {
    try {
      const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
      const ids = tabs.map((t) => t.id).filter((id): id is number => id != null);
      if (ids.length > 0) await chrome.tabs.ungroup(ids as [number, ...number[]]);
    } catch {
      /* already gone */
    }
  }
  await chrome.storage.session.set({ mirrorMap: {} });
}
