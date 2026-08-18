import type { AnalysisResult, GroupColor } from "@thicket/types";

/**
 * Mirror Thicket's groups onto native Chrome tab groups so the organization
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

/**
 * A native group Thicket created, remembered well enough to recognise later.
 *
 * The id alone is not enough. Chrome hands out fresh group ids when it
 * restores a session, so after a restart every group Thicket made looks
 * unfamiliar — and an unfamiliar native group is treated as one the user built
 * by hand, which means Thicket locks it, stops adding related tabs to it, and
 * draws a second group with the same name next to it. Keeping the title and a
 * few member URLs lets it recognise its own work across that boundary.
 */
interface OwnedGroup {
  chromeGroupId: number;
  title: string;
  urls: string[];
  at: number;
}

export async function rememberMirroredGroup(groupId: string, chromeGroupId: number): Promise<void> {
  const map = await readMirrorMap();
  map[groupId] = chromeGroupId;
  await chrome.storage.local.set({ mirrorMap: map });
  await claimGroup(chromeGroupId);
}

export async function readMirrorMap(): Promise<MirrorMap> {
  /**
   * Deliberately storage.local, not storage.session. Session storage is wiped
   * when the browser restarts, and Thicket would forget everything it made.
   */
  const raw = await chrome.storage.local.get("mirrorMap");
  return (raw.mirrorMap as MirrorMap | undefined) ?? {};
}

async function readOwnedGroups(): Promise<OwnedGroup[]> {
  const raw = await chrome.storage.local.get("ownedGroups");
  return (raw.ownedGroups as OwnedGroup[] | undefined) ?? [];
}

async function writeOwnedGroups(owned: OwnedGroup[]): Promise<void> {
  // Keep it bounded; oldest entries are the least likely to still exist.
  await chrome.storage.local.set({ ownedGroups: owned.slice(-200) });
}

/** Record a native group as Thicket's own, with enough detail to re-recognise it. */
export async function claimGroup(chromeGroupId: number): Promise<void> {
  let title = "";
  try {
    title = (await chrome.tabGroups.get(chromeGroupId)).title ?? "";
  } catch {
    return; // gone already
  }
  const tabs = await chrome.tabs.query({ groupId: chromeGroupId }).catch(() => []);
  const urls = tabs.map((t) => t.url ?? "").filter(Boolean).slice(0, 8);
  const owned = (await readOwnedGroups()).filter((o) => o.chromeGroupId !== chromeGroupId);
  owned.push({ chromeGroupId, title, urls, at: Date.now() });
  await writeOwnedGroups(owned);
}

function signatureOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hits = 0;
  for (const url of a) if (setB.has(url)) hits++;
  return hits / Math.min(a.length, b.length);
}

/**
 * Which of the browser's current tab groups are Thicket's own.
 *
 * Ownership is never inferred from the last mirroring pass alone: a pass that
 * skipped a group (too few tabs, a closed window, a thrown error) must not
 * hand that group to the user. Ids that survived are trusted directly; ids
 * that changed — the session-restore case — are reclaimed when a group's title
 * and members still match something Thicket made.
 */
export async function resolveOurGroupIds(
  liveGroups: { id: number; title?: string }[],
  tabsByGroup: Map<number, string[]>,
): Promise<Set<number>> {
  const owned = await readOwnedGroups();
  const liveIds = new Set(liveGroups.map((g) => g.id));
  const ours = new Set<number>();
  const survivors: OwnedGroup[] = [];
  const claimedSignatures = new Set<number>();

  for (const entry of owned) {
    if (!liveIds.has(entry.chromeGroupId)) continue; // stale id — may be reclaimed below
    ours.add(entry.chromeGroupId);
    survivors.push(entry);
    claimedSignatures.add(entry.chromeGroupId);
  }

  const unmatched = owned.filter((o) => !liveIds.has(o.chromeGroupId));
  for (const group of liveGroups) {
    if (ours.has(group.id)) continue;
    const urls = tabsByGroup.get(group.id) ?? [];
    const match = unmatched.find(
      (o) =>
        o.title &&
        o.title === (group.title ?? "") &&
        signatureOverlap(o.urls, urls) >= 0.5,
    );
    if (!match) continue;
    // Same group, new id after a restart. Take it back.
    ours.add(group.id);
    survivors.push({ ...match, chromeGroupId: group.id, urls, at: Date.now() });
    claimedSignatures.add(group.id);
  }

  await writeOwnedGroups(survivors);
  return ours;
}

export async function mirrorGroups(result: AnalysisResult): Promise<void> {
  const mirrorMap = await readMirrorMap();
  const nextMap: MirrorMap = { ...mirrorMap };
  const byId = new Map(result.tabs.map((t) => [t.tabId, t]));

  // Any native group we didn't create is the user's. Its tabs are untouchable —
  // pulling them into a Thicket group would dismantle the user's own strip.
  const liveGroups = await chrome.tabGroups.query({});
  const tabsByGroup = new Map<number, string[]>();
  for (const tab of result.tabs) {
    if (tab.chromeGroupId == null) continue;
    tabsByGroup.set(tab.chromeGroupId, [...(tabsByGroup.get(tab.chromeGroupId) ?? []), tab.url]);
  }
  const ours = await resolveOurGroupIds(liveGroups, tabsByGroup);
  const userGroupIds = new Set(liveGroups.map((g) => g.id).filter((id) => !ours.has(id)));

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
      await claimGroup(chromeGroupId);
    } catch {
      // Tab got closed mid-flight or window went away — next analysis fixes it.
    }
  }

  // Merge rather than replace: a group skipped on this pass (too few tabs, a
  // closed window) still exists in the strip and is still ours.
  await chrome.storage.local.set({ mirrorMap: nextMap });
}

async function groupStillExists(chromeGroupId: number): Promise<boolean> {
  try {
    await chrome.tabGroups.get(chromeGroupId);
    return true;
  } catch {
    return false;
  }
}

/** Remove all Thicket-managed native groups (used when mirroring is turned off). */
export async function unmirrorAll(): Promise<void> {
  const mirrorMap = await readMirrorMap();
  await chrome.storage.local.set({ ownedGroups: [] });
  for (const chromeGroupId of Object.values(mirrorMap)) {
    try {
      const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
      const ids = tabs.map((t) => t.id).filter((id): id is number => id != null);
      if (ids.length > 0) await chrome.tabs.ungroup(ids as [number, ...number[]]);
    } catch {
      /* already gone */
    }
  }
  await chrome.storage.local.set({ mirrorMap: {} });
}
